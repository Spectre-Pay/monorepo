import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  deploySafe,
  signOutboundAttestation,
  signInboundAttestation,
  sendAttestedDeposit,
  execSafeWithAttestation,
  invoiceId,
  currentTimestamp,
} from "./helpers";

describe("E2E Flow — Invoice Payment Lifecycle", function () {
  let guard: any;
  let safe: any;
  let payer: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let teeSigner: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;
  let chainId: number;
  let safeAddr: string;
  let guardAddr: string;

  beforeEach(async function () {
    [recipient, payer, teeSigner, attacker] = await ethers.getSigners();
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    // Deploy Safe for recipient (1-of-1)
    safe = await deploySafe([recipient.address], 1);
    safeAddr = await safe.getAddress();

    // Deploy and attach guard
    const GuardFactory = await ethers.getContractFactory("SpectreGuard");
    guard = await GuardFactory.deploy(teeSigner.address, safeAddr);
    await guard.waitForDeployment();
    guardAddr = await guard.getAddress();

    const setGuardData = safe.interface.encodeFunctionData("setGuard", [guardAddr]);
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
      ethers.ZeroAddress, ethers.ZeroAddress, ethers.hexlify(sigBytes)
    );
  });

  it("full flow: payer sends ETH via guard → recipient withdraws with attestation", async function () {
    // Step 1: Payer sends 1 ETH via guard with TEE attestation
    const now1 = await currentTimestamp();
    const inSig = await signInboundAttestation(
      teeSigner, guardAddr, chainId,
      payer.address, ethers.parseEther("1"), 0, now1 + 3600, invoiceId("DEPOSIT-001")
    );
    await sendAttestedDeposit(
      payer, guardAddr, ethers.parseEther("1"),
      invoiceId("DEPOSIT-001"), 0, now1 + 3600, inSig
    );
    expect(await ethers.provider.getBalance(safeAddr)).to.equal(ethers.parseEther("1"));

    // Step 2: Attacker tries to send ETH directly to Safe — blocked by patched receive()
    await expect(
      attacker.sendTransaction({ to: safeAddr, value: ethers.parseEther("0.5") })
    ).to.be.reverted;
    expect(await ethers.provider.getBalance(safeAddr)).to.equal(ethers.parseEther("1"));

    // Step 3: Recipient withdraws 1 ETH with TEE attestation
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const inv = invoiceId("WITHDRAW-001");

    const outSig = await signOutboundAttestation(
      teeSigner, guardAddr, chainId,
      safeAddr, recipient.address,
      ethers.parseEther("1"), 1, deadline, inv
    );

    const recipientBefore = await ethers.provider.getBalance(recipient.address);

    await execSafeWithAttestation(
      safe, recipient, recipient.address,
      ethers.parseEther("1"), "0x",
      1, deadline, inv, outSig
    );

    const recipientAfter = await ethers.provider.getBalance(recipient.address);
    expect(recipientAfter - recipientBefore).to.be.greaterThan(ethers.parseEther("0.99"));

    // Step 4: Recipient tries to withdraw WITHOUT attestation — blocked
    const safeNonce = await safe.nonce();
    const txHash = await safe.getTransactionHash(
      attacker.address, ethers.parseEther("0.1"), "0x",
      0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    const badSig = await recipient.signMessage(ethers.getBytes(txHash));
    const badSigBytes = ethers.getBytes(badSig);
    badSigBytes[64] += 4;

    await expect(
      safe.execTransaction(
        attacker.address, ethers.parseEther("0.1"), "0x",
        0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress,
        ethers.hexlify(badSigBytes)
      )
    ).to.be.reverted;
  });

  it("multiple payers can fund via attested deposit", async function () {
    const now = await currentTimestamp();
    const deadline = now + 3600;

    const sig1 = await signInboundAttestation(
      teeSigner, guardAddr, chainId,
      payer.address, ethers.parseEther("1"), 10, deadline, invoiceId("MULTI-1")
    );
    await sendAttestedDeposit(payer, guardAddr, ethers.parseEther("1"), invoiceId("MULTI-1"), 10, deadline, sig1);

    const sig2 = await signInboundAttestation(
      teeSigner, guardAddr, chainId,
      attacker.address, ethers.parseEther("2"), 11, deadline, invoiceId("MULTI-2")
    );
    await sendAttestedDeposit(attacker, guardAddr, ethers.parseEther("2"), invoiceId("MULTI-2"), 11, deadline, sig2);

    const sig3 = await signInboundAttestation(
      teeSigner, guardAddr, chainId,
      recipient.address, ethers.parseEther("3"), 12, deadline, invoiceId("MULTI-3")
    );
    await sendAttestedDeposit(recipient, guardAddr, ethers.parseEther("3"), invoiceId("MULTI-3"), 12, deadline, sig3);

    expect(await ethers.provider.getBalance(safeAddr)).to.equal(ethers.parseEther("6"));
  });
});
