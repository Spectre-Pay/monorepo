import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { SpectreGuard } from "../typechain-types";
import {
  deploySafe,
  signInboundAttestation,
  signOutboundAttestation,
  execSafeWithAttestation,
  invoiceId,
  currentTimestamp,
} from "./helpers";

describe("E2E Flow — Invoice Payment Lifecycle", function () {
  let guard: SpectreGuard;
  let safe: any;
  let payer: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let teeSigner: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;
  let chainId: number;

  beforeEach(async function () {
    [recipient, payer, teeSigner, attacker] = await ethers.getSigners();
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    // Step 1: Setup
    // Deploy Safe for recipient (1-of-1)
    safe = await deploySafe([recipient.address], 1);
    const safeAddr = await safe.getAddress();

    // Deploy SpectreGuard
    const GuardFactory = await ethers.getContractFactory("SpectreGuard");
    guard = await GuardFactory.deploy(teeSigner.address, safeAddr);
    await guard.waitForDeployment();

    // Attach guard to Safe (before guard is active, no TEE attestation needed)
    const setGuardData = safe.interface.encodeFunctionData("setGuard", [
      await guard.getAddress(),
    ]);
    const safeNonce = await safe.nonce();
    const txHash = await safe.getTransactionHash(
      safeAddr, 0, setGuardData, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    const sig = await recipient.signMessage(ethers.getBytes(txHash));
    const sigBytes = ethers.getBytes(sig);
    sigBytes[64] += 4;

    await safe.execTransaction(
      safeAddr, 0, setGuardData, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress,
      ethers.hexlify(sigBytes)
    );
  });

  it("full flow: payer pays invoice → recipient withdraws", async function () {
    const guardAddr = await guard.getAddress();
    const safeAddr = await safe.getAddress();

    // Step 2: Payer sends payment for INV-001
    const inv = invoiceId("INV-001");
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const amount = ethers.parseEther("1");

    const inboundSig = await signInboundAttestation(
      teeSigner, guardAddr, chainId,
      payer.address, guardAddr,
      amount, 0, deadline, inv
    );

    await guard.connect(payer).attestedDeposit(inv, 0, deadline, inboundSig, {
      value: amount,
    });

    // Verify Safe balance
    expect(await ethers.provider.getBalance(safeAddr)).to.equal(amount);

    // Step 3: Attacker tries to deposit with garbage signature
    const garbageSig = ethers.hexlify(ethers.randomBytes(65));
    await expect(
      guard.connect(attacker).attestedDeposit(
        invoiceId("FAKE"), 99, deadline, garbageSig,
        { value: ethers.parseEther("1") }
      )
    ).to.be.reverted;

    // Step 4: Attacker tries plain ETH send to guard (blocked)
    await expect(
      attacker.sendTransaction({
        to: guardAddr,
        value: ethers.parseEther("1"),
      })
    ).to.be.revertedWithCustomError(guard, "DirectTransferBlocked");

    // Step 5: Recipient withdraws
    const now2 = await currentTimestamp();
    const deadline2 = now2 + 3600;
    const withdrawInv = invoiceId("WITHDRAW-001");

    const outboundSig = await signOutboundAttestation(
      teeSigner, guardAddr, chainId,
      safeAddr, recipient.address,
      amount, 1, deadline2, withdrawInv
    );

    const recipientBefore = await ethers.provider.getBalance(recipient.address);

    await execSafeWithAttestation(
      safe, recipient, recipient.address,
      amount, "0x",
      1, deadline2, withdrawInv, outboundSig
    );

    const recipientAfter = await ethers.provider.getBalance(recipient.address);
    // Recipient gains ~1 ETH (minus gas)
    expect(recipientAfter - recipientBefore).to.be.greaterThan(
      ethers.parseEther("0.99")
    );

    // Step 6: Recipient tries to withdraw to a destination without attestation
    // Without TEE attestation, the Safe tx should fail
    const safeNonce = await safe.nonce();
    const badTxHash = await safe.getTransactionHash(
      attacker.address, ethers.parseEther("0.1"), "0x",
      0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    const badSig = await recipient.signMessage(ethers.getBytes(badTxHash));
    const badSigBytes = ethers.getBytes(badSig);
    badSigBytes[64] += 4;

    // This should fail because the guard expects TEE attestation data appended
    await expect(
      safe.execTransaction(
        attacker.address, ethers.parseEther("0.1"), "0x",
        0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress,
        ethers.hexlify(badSigBytes)
      )
    ).to.be.reverted;
  });

  it("multiple invoices can be paid to the same Safe", async function () {
    const guardAddr = await guard.getAddress();
    const safeAddr = await safe.getAddress();
    const now = await currentTimestamp();

    // Pay 3 invoices
    for (let i = 0; i < 3; i++) {
      const inv = invoiceId(`MULTI-INV-${i}`);
      const amount = ethers.parseEther(`${i + 1}`);
      const deadline = now + 3600;

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        amount, i, deadline, inv
      );

      await guard.connect(payer).attestedDeposit(inv, i, deadline, teeSig, {
        value: amount,
      });
    }

    // Safe should have 1 + 2 + 3 = 6 ETH
    expect(await ethers.provider.getBalance(safeAddr)).to.equal(
      ethers.parseEther("6")
    );
  });
});
