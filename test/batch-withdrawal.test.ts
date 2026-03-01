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

describe("Batch Withdrawal — Multi-Safe Consolidation", function () {
  let guardA: SpectreGuard;
  let guardB: SpectreGuard;
  let guardC: SpectreGuard;
  let safeA: any;
  let safeB: any;
  let safeC: any;
  let payer: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let teeSigner: HardhatEthersSigner;
  let destination: HardhatEthersSigner;
  let chainId: number;

  // Helper to setup a Safe with guard and fund it
  async function setupFundedSafe(
    safeOwner: HardhatEthersSigner,
    tee: HardhatEthersSigner,
    funder: HardhatEthersSigner,
    fundAmount: bigint,
    inv: string,
    nonce: number
  ): Promise<{ safe: any; guard: SpectreGuard }> {
    // Deploy Safe
    const safe = await deploySafe([safeOwner.address], 1);
    const safeAddr = await safe.getAddress();

    // Deploy Guard
    const GuardFactory = await ethers.getContractFactory("SpectreGuard");
    const guard = await GuardFactory.deploy(tee.address, safeAddr);
    await guard.waitForDeployment();
    const guardAddr = await guard.getAddress();

    // Attach guard (before guard is active)
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
      ethers.ZeroAddress, ethers.ZeroAddress,
      ethers.hexlify(sigBytes)
    );

    // Fund via attestedDeposit
    const now = await currentTimestamp();
    const deadline = now + 3600;

    const teeSig = await signInboundAttestation(
      tee, guardAddr, chainId,
      funder.address, guardAddr,
      fundAmount, nonce, deadline, inv
    );

    await guard.connect(funder).attestedDeposit(inv, nonce, deadline, teeSig, {
      value: fundAmount,
    });

    return { safe, guard: guard as SpectreGuard };
  }

  beforeEach(async function () {
    [recipient, payer, teeSigner, destination] = await ethers.getSigners();
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    // Setup 3 funded Safes
    const setupA = await setupFundedSafe(
      recipient, teeSigner, payer,
      ethers.parseEther("1"),
      invoiceId("BATCH-INV-1"), 0
    );
    safeA = setupA.safe;
    guardA = setupA.guard;

    const setupB = await setupFundedSafe(
      recipient, teeSigner, payer,
      ethers.parseEther("0.5"),
      invoiceId("BATCH-INV-2"), 0
    );
    safeB = setupB.safe;
    guardB = setupB.guard;

    const setupC = await setupFundedSafe(
      recipient, teeSigner, payer,
      ethers.parseEther("2"),
      invoiceId("BATCH-INV-3"), 0
    );
    safeC = setupC.safe;
    guardC = setupC.guard;
  });

  it("batch withdrawal: 3 Safes → single destination", async function () {
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const destAddr = destination.address;
    const destBefore = await ethers.provider.getBalance(destAddr);

    // Withdraw from Safe A (1 ETH)
    const guardAAddr = await guardA.getAddress();
    const safeAAddr = await safeA.getAddress();
    const sigA = await signOutboundAttestation(
      teeSigner, guardAAddr, chainId,
      safeAAddr, destAddr,
      ethers.parseEther("1"), 1, deadline, invoiceId("BATCH-OUT-A")
    );
    await execSafeWithAttestation(
      safeA, recipient, destAddr,
      ethers.parseEther("1"), "0x",
      1, deadline, invoiceId("BATCH-OUT-A"), sigA
    );

    // Withdraw from Safe B (0.5 ETH)
    const guardBAddr = await guardB.getAddress();
    const safeBAddr = await safeB.getAddress();
    const sigB = await signOutboundAttestation(
      teeSigner, guardBAddr, chainId,
      safeBAddr, destAddr,
      ethers.parseEther("0.5"), 1, deadline, invoiceId("BATCH-OUT-B")
    );
    await execSafeWithAttestation(
      safeB, recipient, destAddr,
      ethers.parseEther("0.5"), "0x",
      1, deadline, invoiceId("BATCH-OUT-B"), sigB
    );

    // Withdraw from Safe C (2 ETH)
    const guardCAddr = await guardC.getAddress();
    const safeCAddr = await safeC.getAddress();
    const sigC = await signOutboundAttestation(
      teeSigner, guardCAddr, chainId,
      safeCAddr, destAddr,
      ethers.parseEther("2"), 1, deadline, invoiceId("BATCH-OUT-C")
    );
    await execSafeWithAttestation(
      safeC, recipient, destAddr,
      ethers.parseEther("2"), "0x",
      1, deadline, invoiceId("BATCH-OUT-C"), sigC
    );

    // Destination should have received 3.5 ETH total
    const destAfter = await ethers.provider.getBalance(destAddr);
    expect(destAfter - destBefore).to.equal(ethers.parseEther("3.5"));

    // All Safes should be empty
    expect(await ethers.provider.getBalance(safeAAddr)).to.equal(0);
    expect(await ethers.provider.getBalance(safeBAddr)).to.equal(0);
    expect(await ethers.provider.getBalance(safeCAddr)).to.equal(0);
  });

  it("partial batch: one Safe blocked, others succeed", async function () {
    const now = await currentTimestamp();
    const deadline = now + 3600;
    const destAddr = destination.address;
    const destBefore = await ethers.provider.getBalance(destAddr);

    // Withdraw from Safe A (1 ETH) — succeeds
    const guardAAddr = await guardA.getAddress();
    const safeAAddr = await safeA.getAddress();
    const sigA = await signOutboundAttestation(
      teeSigner, guardAAddr, chainId,
      safeAAddr, destAddr,
      ethers.parseEther("1"), 1, deadline, invoiceId("PARTIAL-OUT-A")
    );
    await execSafeWithAttestation(
      safeA, recipient, destAddr,
      ethers.parseEther("1"), "0x",
      1, deadline, invoiceId("PARTIAL-OUT-A"), sigA
    );

    // Safe B — TEE refuses attestation (simulate by using wrong signer)
    const guardBAddr = await guardB.getAddress();
    const safeBAddr = await safeB.getAddress();

    // Use payer as signer (not the registered TEE signer) to simulate TEE refusal
    const badSigB = await signOutboundAttestation(
      payer, // wrong signer — simulates TEE refusal
      guardBAddr, chainId,
      safeBAddr, destAddr,
      ethers.parseEther("0.5"), 1, deadline, invoiceId("PARTIAL-OUT-B")
    );

    await expect(
      execSafeWithAttestation(
        safeB, recipient, destAddr,
        ethers.parseEther("0.5"), "0x",
        1, deadline, invoiceId("PARTIAL-OUT-B"), badSigB
      )
    ).to.be.reverted;

    // Withdraw from Safe C (2 ETH) — succeeds
    const guardCAddr = await guardC.getAddress();
    const safeCAddr = await safeC.getAddress();
    const sigC = await signOutboundAttestation(
      teeSigner, guardCAddr, chainId,
      safeCAddr, destAddr,
      ethers.parseEther("2"), 1, deadline, invoiceId("PARTIAL-OUT-C")
    );
    await execSafeWithAttestation(
      safeC, recipient, destAddr,
      ethers.parseEther("2"), "0x",
      1, deadline, invoiceId("PARTIAL-OUT-C"), sigC
    );

    // Destination should have received 3 ETH (A + C, not B)
    const destAfter = await ethers.provider.getBalance(destAddr);
    expect(destAfter - destBefore).to.equal(ethers.parseEther("3"));

    // Safe B still holds its funds
    expect(await ethers.provider.getBalance(safeBAddr)).to.equal(
      ethers.parseEther("0.5")
    );
  });
});
