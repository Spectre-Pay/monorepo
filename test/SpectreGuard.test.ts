import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { SpectreGuard } from "../typechain-types";
import {
  deploySafe,
  signOutboundAttestation,
  signInboundAttestation,
  sendAttestedDeposit,
  execSafeWithAttestation,
  invoiceId,
  currentTimestamp,
  advanceTime,
} from "./helpers";

describe("SpectreGuard", function () {
  let guard: SpectreGuard;
  let safe: any;
  let owner: HardhatEthersSigner;
  let payer: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;
  let teeSigner: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let chainId: number;
  let safeAddr: string;
  let guardAddr: string;

  beforeEach(async function () {
    [owner, payer, attacker, teeSigner, recipient] = await ethers.getSigners();
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    // Deploy Safe (1-of-1 with owner)
    safe = await deploySafe([owner.address], 1);
    safeAddr = await safe.getAddress();

    // Deploy SpectreGuard
    const GuardFactory = await ethers.getContractFactory("SpectreGuard");
    guard = await GuardFactory.deploy(teeSigner.address, safeAddr);
    await guard.waitForDeployment();
    guardAddr = await guard.getAddress();

    // Attach guard to Safe (before guard is active, no TEE attestation needed)
    const setGuardData = safe.interface.encodeFunctionData("setGuard", [guardAddr]);
    const safeNonce = await safe.nonce();
    const txHash = await safe.getTransactionHash(
      safeAddr, 0, setGuardData, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    const sig = await owner.signMessage(ethers.getBytes(txHash));
    const sigBytes = ethers.getBytes(sig);
    sigBytes[64] += 4;
    await safe.execTransaction(
      safeAddr, 0, setGuardData, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, ethers.hexlify(sigBytes)
    );
  });

  describe("Inbound — attested deposit via guard fallback", function () {
    it("accepts ETH with valid TEE attestation and forwards to Safe", async function () {
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const inv = invoiceId("IN-001");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, ethers.parseEther("1"), 0, deadline, inv
      );

      await sendAttestedDeposit(
        payer, guardAddr, ethers.parseEther("1"),
        inv, 0, deadline, teeSig
      );

      expect(await ethers.provider.getBalance(safeAddr)).to.equal(ethers.parseEther("1"));
    });

    it("reverts bare ETH send (no calldata)", async function () {
      await expect(
        payer.sendTransaction({ to: guardAddr, value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(guard, "DirectTransferBlocked");
    });

    it("reverts if attestation signer is wrong", async function () {
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const inv = invoiceId("IN-BAD");

      const badSig = await signInboundAttestation(
        attacker, guardAddr, chainId,
        payer.address, ethers.parseEther("1"), 0, deadline, inv
      );

      await expect(
        sendAttestedDeposit(
          payer, guardAddr, ethers.parseEther("1"),
          inv, 0, deadline, badSig
        )
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });

    it("reverts if nonce replayed on inbound", async function () {
      const now = await currentTimestamp();
      const deadline = now + 3600;

      const sig1 = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, ethers.parseEther("1"), 0, deadline, invoiceId("IN-1")
      );
      await sendAttestedDeposit(
        payer, guardAddr, ethers.parseEther("1"),
        invoiceId("IN-1"), 0, deadline, sig1
      );

      const sig2 = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, ethers.parseEther("1"), 0, deadline, invoiceId("IN-2")
      );
      await expect(
        sendAttestedDeposit(
          payer, guardAddr, ethers.parseEther("1"),
          invoiceId("IN-2"), 0, deadline, sig2
        )
      ).to.be.revertedWithCustomError(guard, "NonceAlreadyUsed");
    });

    it("reverts if deadline expired on inbound", async function () {
      const now = await currentTimestamp();
      const deadline = now + 60;
      const inv = invoiceId("IN-EXP");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, ethers.parseEther("1"), 0, deadline, inv
      );

      await advanceTime(120);

      await expect(
        sendAttestedDeposit(
          payer, guardAddr, ethers.parseEther("1"),
          inv, 0, deadline, teeSig
        )
      ).to.be.revertedWithCustomError(guard, "DeadlineExpired");
    });

    it("reverts if value is zero", async function () {
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const inv = invoiceId("IN-ZERO");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, 0n, 0, deadline, inv
      );

      await expect(
        sendAttestedDeposit(
          payer, guardAddr, 0n,
          inv, 0, deadline, teeSig
        )
      ).to.be.revertedWithCustomError(guard, "ZeroValue");
    });

    it("direct ETH send to Safe is blocked when guard is set", async function () {
      await expect(
        payer.sendTransaction({ to: safeAddr, value: ethers.parseEther("1") })
      ).to.be.reverted;
    });
  });

  describe("Outbound — checkTransaction via Safe.execTransaction", function () {
    beforeEach(async function () {
      // Fund Safe via attested deposit through guard
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, ethers.parseEther("5"), 49, deadline, invoiceId("FUND-OUT")
      );
      await sendAttestedDeposit(
        payer, guardAddr, ethers.parseEther("5"),
        invoiceId("FUND-OUT"), 49, deadline, teeSig
      );
    });

    it("allows ETH send with valid TEE attestation", async function () {
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");
      const deadline = now + 3600;

      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 0, deadline, inv
      );

      const recipientBefore = await ethers.provider.getBalance(recipient.address);

      await execSafeWithAttestation(
        safe, owner, recipient.address,
        ethers.parseEther("1"), "0x",
        0, deadline, inv, outSig
      );

      const recipientAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(ethers.parseEther("1"));
    });

    it("reverts if attestation signer is wrong", async function () {
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");

      const badSig = await signOutboundAttestation(
        attacker, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 0, now + 3600, inv
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          0, now + 3600, inv, badSig
        )
      ).to.be.reverted;
    });

    it("reverts if nonce replayed", async function () {
      const now = await currentTimestamp();
      const deadline = now + 3600;

      const sig1 = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 0, deadline, invoiceId("OUT-1")
      );

      await execSafeWithAttestation(
        safe, owner, recipient.address,
        ethers.parseEther("1"), "0x",
        0, deadline, invoiceId("OUT-1"), sig1
      );

      // Replay with same nonce 0
      const sig2 = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 0, deadline, invoiceId("OUT-2")
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          0, deadline, invoiceId("OUT-2"), sig2
        )
      ).to.be.reverted;
    });

    it("reverts if deadline expired", async function () {
      const now = await currentTimestamp();
      const deadline = now + 60;
      const inv = invoiceId("OUT-001");

      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 0, deadline, inv
      );

      await advanceTime(120);

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          0, deadline, inv, outSig
        )
      ).to.be.reverted;
    });

    it("reverts if destination doesn't match", async function () {
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");

      // Sign for recipient but send to attacker
      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 0, now + 3600, inv
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, attacker.address,
          ethers.parseEther("1"), "0x",
          0, now + 3600, inv, outSig
        )
      ).to.be.reverted;
    });

    it("reverts Safe tx without any TEE attestation", async function () {
      const safeNonce = await safe.nonce();
      const txHash = await safe.getTransactionHash(
        recipient.address, ethers.parseEther("1"), "0x",
        0, 0, 0, 0,
        ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
      );
      const sig = await owner.signMessage(ethers.getBytes(txHash));
      const sigBytes = ethers.getBytes(sig);
      sigBytes[64] += 4;

      await expect(
        safe.execTransaction(
          recipient.address, ethers.parseEther("1"), "0x",
          0, 0, 0, 0,
          ethers.ZeroAddress, ethers.ZeroAddress,
          ethers.hexlify(sigBytes)
        )
      ).to.be.reverted;
    });
  });

  describe("Admin", function () {
    it("Safe can update TEE signer", async function () {
      const now = await currentTimestamp();
      const setSignerData = guard.interface.encodeFunctionData("setTeeSigner", [
        attacker.address,
      ]);
      const inv = invoiceId("ADMIN-001");
      const deadline = now + 3600;

      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, guardAddr, 0n, 0, deadline, inv
      );

      await execSafeWithAttestation(
        safe, owner, guardAddr, 0n, setSignerData,
        0, deadline, inv, outSig
      );

      expect(await guard.getTeeSigner()).to.equal(attacker.address);
    });

    it("non-Safe cannot update TEE signer", async function () {
      await expect(
        guard.connect(owner).setTeeSigner(attacker.address)
      ).to.be.revertedWithCustomError(guard, "OnlySafe");
    });

    it("old signer's attestations rejected after rotation", async function () {
      const now = await currentTimestamp();
      const deadline = now + 3600;

      // Rotate to attacker as new signer
      const setSignerData = guard.interface.encodeFunctionData("setTeeSigner", [
        attacker.address,
      ]);
      const rotSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, guardAddr, 0n, 0, deadline, invoiceId("ROTATE")
      );
      await execSafeWithAttestation(
        safe, owner, guardAddr, 0n, setSignerData,
        0, deadline, invoiceId("ROTATE"), rotSig
      );

      // Fund Safe via attested deposit (using new signer = attacker)
      const fundSig = await signInboundAttestation(
        attacker, guardAddr, chainId,
        payer.address, ethers.parseEther("1"), 90, deadline, invoiceId("FUND-ROT")
      );
      await sendAttestedDeposit(
        payer, guardAddr, ethers.parseEther("1"),
        invoiceId("FUND-ROT"), 90, deadline, fundSig
      );

      const oldSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, invoiceId("OLD")
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          1, deadline, invoiceId("OLD"), oldSig
        )
      ).to.be.reverted;
    });
  });
});
