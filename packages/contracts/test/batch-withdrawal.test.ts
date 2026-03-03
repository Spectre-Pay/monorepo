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

describe("Batch Withdrawal — Multi-Safe Consolidation", function () {
  let guardA: any, guardB: any, guardC: any;
  let safeA: any, safeB: any, safeC: any;
  let safeAAddr: string, safeBAddr: string, safeCAddr: string;
  let guardAAddr: string, guardBAddr: string, guardCAddr: string;
  let payer: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let teeSigner: HardhatEthersSigner;
  let destination: HardhatEthersSigner;
  let chainId: number;
  let fundNonce: number = 100;

  async function setupGuardedSafe(
    safeOwner: HardhatEthersSigner,
    tee: HardhatEthersSigner,
    funder: HardhatEthersSigner,
    fundAmount: bigint
  ) {
    const safe = await deploySafe([safeOwner.address], 1);
    const safeAddr = await safe.getAddress();

    const GuardFactory = await ethers.getContractFactory("SpectreGuard");
    const guard = await GuardFactory.deploy(tee.address, safeAddr);
    await guard.waitForDeployment();
    const guardAddr = await guard.getAddress();

    // Attach guard
    const setGuardData = safe.interface.encodeFunctionData("setGuard", [guardAddr]);
    const safeNonce = await safe.nonce();
    const txHash = await safe.getTransactionHash(
      safeAddr, 0, setGuardData, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    const sig = await safeOwner.signMessage(ethers.getBytes(txHash));
    const sigBytes = ethers.getBytes(sig);
    sigBytes[64] += 4;
    await safe.execTransaction(
      safeAddr, 0, setGuardData, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, ethers.hexlify(sigBytes)
    );

    // Fund via attested deposit through guard
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const nonce = fundNonce++;
    const inv = invoiceId(`FUND-${nonce}`);
    const teeSig = await signInboundAttestation(
      tee, guardAddr, chainId,
      funder.address, fundAmount, nonce, deadline, inv
    );
    await sendAttestedDeposit(funder, guardAddr, fundAmount, inv, nonce, deadline, teeSig);

    return { safe, guard, safeAddr, guardAddr };
  }

  beforeEach(async function () {
    [recipient, payer, teeSigner, destination] = await ethers.getSigners();
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    const a = await setupGuardedSafe(recipient, teeSigner, payer, ethers.parseEther("1"));
    safeA = a.safe; guardA = a.guard; safeAAddr = a.safeAddr; guardAAddr = a.guardAddr;

    const b = await setupGuardedSafe(recipient, teeSigner, payer, ethers.parseEther("0.5"));
    safeB = b.safe; guardB = b.guard; safeBAddr = b.safeAddr; guardBAddr = b.guardAddr;

    const c = await setupGuardedSafe(recipient, teeSigner, payer, ethers.parseEther("2"));
    safeC = c.safe; guardC = c.guard; safeCAddr = c.safeAddr; guardCAddr = c.guardAddr;
  });

  it("batch withdrawal: 3 Safes → single destination", async function () {
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const destAddr = destination.address;
    const destBefore = await ethers.provider.getBalance(destAddr);

    // Withdraw from all 3
    const sigA = await signOutboundAttestation(
      teeSigner, guardAAddr, chainId,
      safeAAddr, destAddr, ethers.parseEther("1"), 0, deadline, invoiceId("BATCH-A")
    );
    await execSafeWithAttestation(
      safeA, recipient, destAddr, ethers.parseEther("1"), "0x",
      0, deadline, invoiceId("BATCH-A"), sigA
    );

    const sigB = await signOutboundAttestation(
      teeSigner, guardBAddr, chainId,
      safeBAddr, destAddr, ethers.parseEther("0.5"), 0, deadline, invoiceId("BATCH-B")
    );
    await execSafeWithAttestation(
      safeB, recipient, destAddr, ethers.parseEther("0.5"), "0x",
      0, deadline, invoiceId("BATCH-B"), sigB
    );

    const sigC = await signOutboundAttestation(
      teeSigner, guardCAddr, chainId,
      safeCAddr, destAddr, ethers.parseEther("2"), 0, deadline, invoiceId("BATCH-C")
    );
    await execSafeWithAttestation(
      safeC, recipient, destAddr, ethers.parseEther("2"), "0x",
      0, deadline, invoiceId("BATCH-C"), sigC
    );

    const destAfter = await ethers.provider.getBalance(destAddr);
    expect(destAfter - destBefore).to.equal(ethers.parseEther("3.5"));

    expect(await ethers.provider.getBalance(safeAAddr)).to.equal(0);
    expect(await ethers.provider.getBalance(safeBAddr)).to.equal(0);
    expect(await ethers.provider.getBalance(safeCAddr)).to.equal(0);
  });

  it("partial batch: one Safe blocked, others succeed", async function () {
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const destAddr = destination.address;
    const destBefore = await ethers.provider.getBalance(destAddr);

    // A succeeds
    const sigA = await signOutboundAttestation(
      teeSigner, guardAAddr, chainId,
      safeAAddr, destAddr, ethers.parseEther("1"), 0, deadline, invoiceId("PARTIAL-A")
    );
    await execSafeWithAttestation(
      safeA, recipient, destAddr, ethers.parseEther("1"), "0x",
      0, deadline, invoiceId("PARTIAL-A"), sigA
    );

    // B blocked (wrong signer simulates TEE refusal)
    const badSigB = await signOutboundAttestation(
      payer, guardBAddr, chainId,
      safeBAddr, destAddr, ethers.parseEther("0.5"), 0, deadline, invoiceId("PARTIAL-B")
    );
    await expect(
      execSafeWithAttestation(
        safeB, recipient, destAddr, ethers.parseEther("0.5"), "0x",
        0, deadline, invoiceId("PARTIAL-B"), badSigB
      )
    ).to.be.reverted;

    // C succeeds
    const sigC = await signOutboundAttestation(
      teeSigner, guardCAddr, chainId,
      safeCAddr, destAddr, ethers.parseEther("2"), 0, deadline, invoiceId("PARTIAL-C")
    );
    await execSafeWithAttestation(
      safeC, recipient, destAddr, ethers.parseEther("2"), "0x",
      0, deadline, invoiceId("PARTIAL-C"), sigC
    );

    const destAfter = await ethers.provider.getBalance(destAddr);
    expect(destAfter - destBefore).to.equal(ethers.parseEther("3"));
    expect(await ethers.provider.getBalance(safeBAddr)).to.equal(ethers.parseEther("0.5"));
  });
});
