import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { SpectreGuard, MockERC20 } from "../typechain-types";
import {
  deploySafe,
  signInboundAttestation,
  signInboundTokenAttestation,
  signOutboundAttestation,
  execSafeWithAttestation,
  invoiceId,
  currentTimestamp,
  advanceTime,
} from "./helpers";

describe("SpectreGuard", function () {
  let guard: SpectreGuard;
  let safe: any; // ethers.Contract (Safe)
  let mockToken: MockERC20;
  let owner: HardhatEthersSigner;
  let payer: HardhatEthersSigner;
  let attacker: HardhatEthersSigner;
  let teeSigner: HardhatEthersSigner;
  let recipient: HardhatEthersSigner;
  let chainId: number;

  beforeEach(async function () {
    [owner, payer, attacker, teeSigner, recipient] = await ethers.getSigners();
    chainId = Number((await ethers.provider.getNetwork()).chainId);

    // Deploy Safe with owner as sole owner (1-of-1)
    safe = await deploySafe([owner.address], 1);
    const safeAddress = await safe.getAddress();

    // Deploy SpectreGuard
    const GuardFactory = await ethers.getContractFactory("SpectreGuard");
    guard = await GuardFactory.deploy(teeSigner.address, safeAddress);
    await guard.waitForDeployment();

    // Attach guard to Safe (must be called as the Safe itself)
    const setGuardData = safe.interface.encodeFunctionData("setGuard", [
      await guard.getAddress(),
    ]);
    // Execute via Safe to call setGuard on itself
    const { signature } = await buildSafeSig(safe, owner, safeAddress, 0n, setGuardData);
    await safe.execTransaction(
      safeAddress,
      0,
      setGuardData,
      0, 0, 0, 0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      signature
    );

    // Deploy mock ERC-20
    const TokenFactory = await ethers.getContractFactory("MockERC20");
    mockToken = await TokenFactory.deploy("Test USDC", "USDC");
    await mockToken.waitForDeployment();

    // Fund payer with some ETH (already has from hardhat) and tokens
    await mockToken.mint(payer.address, ethers.parseEther("10000"));
  });

  // Helper to build Safe owner signature (before guard is attached or for non-guarded calls)
  async function buildSafeSig(
    safeContract: any,
    signer: HardhatEthersSigner,
    to: string,
    value: bigint,
    data: string
  ) {
    const safeNonce = await safeContract.nonce();
    const txHash = await safeContract.getTransactionHash(
      to, value, data, 0, 0, 0, 0,
      ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
    );
    const sig = await signer.signMessage(ethers.getBytes(txHash));
    const sigBytes = ethers.getBytes(sig);
    sigBytes[64] += 4; // Safe eth_sign adjustment
    return { signature: ethers.hexlify(sigBytes), txHash, safeNonce };
  }

  describe("Inbound — attestedDeposit (ETH)", function () {
    it("accepts deposit with valid TEE signature", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const inv = invoiceId("INV-001");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, deadline, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, deadline, teeSig, {
          value: ethers.parseEther("1"),
        })
      )
        .to.emit(guard, "AttestedDeposit")
        .withArgs(payer.address, inv, ethers.parseEther("1"), 0);

      // Verify Safe received the ETH
      expect(await ethers.provider.getBalance(safeAddr)).to.equal(
        ethers.parseEther("1")
      );
    });

    it("accepts deposits with different amounts and invoice IDs", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();

      for (let i = 0; i < 3; i++) {
        const amount = ethers.parseEther(`${i + 1}`);
        const inv = invoiceId(`INV-${i}`);
        const deadline = now + 3600;

        const teeSig = await signInboundAttestation(
          teeSigner, guardAddr, chainId,
          payer.address, guardAddr, amount, i, deadline, inv
        );

        await guard.connect(payer).attestedDeposit(inv, i, deadline, teeSig, {
          value: amount,
        });
      }

      const safeAddr = await safe.getAddress();
      // 1 + 2 + 3 = 6 ETH
      expect(await ethers.provider.getBalance(safeAddr)).to.equal(
        ethers.parseEther("6")
      );
    });

    it("reverts if TEE signature is from wrong signer", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("INV-001");

      // Sign with attacker instead of TEE
      const badSig = await signInboundAttestation(
        attacker, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, now + 3600, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, now + 3600, badSig, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });

    it("reverts if nonce is already used (replay)", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("INV-001");
      const deadline = now + 3600;

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, deadline, inv
      );

      // First deposit succeeds
      await guard.connect(payer).attestedDeposit(inv, 0, deadline, teeSig, {
        value: ethers.parseEther("1"),
      });

      // Replay with same nonce fails
      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, deadline, teeSig, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "NonceAlreadyUsed");
    });

    it("reverts if deadline has passed", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const pastDeadline = now - 1;
      const inv = invoiceId("INV-001");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, pastDeadline, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, pastDeadline, teeSig, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "DeadlineExpired");
    });

    it("reverts if deadline is too far in the future", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const farDeadline = now + 7200; // 2 hours > MAX_DEADLINE_WINDOW (1 hour)
      const inv = invoiceId("INV-001");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, farDeadline, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, farDeadline, teeSig, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "DeadlineTooFarInFuture");
    });

    it("reverts if value doesn't match signed value", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("INV-001");
      const deadline = now + 3600;

      // Sign for 1 ETH but send 2 ETH
      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, deadline, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, deadline, teeSig, {
          value: ethers.parseEther("2"),
        })
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });

    it("reverts if invoiceId doesn't match", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("INV-001");
      const wrongInv = invoiceId("INV-002");
      const deadline = now + 3600;

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, deadline, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(wrongInv, 0, deadline, teeSig, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });

    it("reverts with zero value", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("INV-001");
      const deadline = now + 3600;

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        0n, 0, deadline, inv
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv, 0, deadline, teeSig, {
          value: 0,
        })
      ).to.be.revertedWithCustomError(guard, "ZeroValue");
    });
  });

  describe("Inbound — attestedTokenDeposit (ERC-20)", function () {
    it("accepts ERC-20 deposit with valid TEE signature", async function () {
      const guardAddr = await guard.getAddress();
      const tokenAddr = await mockToken.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const inv = invoiceId("TOKEN-INV-001");
      const amount = ethers.parseEther("100");

      // Approve guard to pull tokens
      await mockToken.connect(payer).approve(guardAddr, amount);

      const teeSig = await signInboundTokenAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr, tokenAddr,
        amount, 0, deadline, inv
      );

      await expect(
        guard.connect(payer).attestedTokenDeposit(
          tokenAddr, amount, inv, 0, deadline, teeSig
        )
      )
        .to.emit(guard, "AttestedTokenDeposit")
        .withArgs(payer.address, tokenAddr, inv, amount, 0);

      // Verify Safe received the tokens
      expect(await mockToken.balanceOf(safeAddr)).to.equal(amount);
    });

    it("reverts ERC-20 deposit with wrong signer", async function () {
      const guardAddr = await guard.getAddress();
      const tokenAddr = await mockToken.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("TOKEN-INV-001");
      const amount = ethers.parseEther("100");

      await mockToken.connect(payer).approve(guardAddr, amount);

      const badSig = await signInboundTokenAttestation(
        attacker, guardAddr, chainId,
        payer.address, guardAddr, tokenAddr,
        amount, 0, now + 3600, inv
      );

      await expect(
        guard.connect(payer).attestedTokenDeposit(
          tokenAddr, amount, inv, 0, now + 3600, badSig
        )
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });

    it("reverts ERC-20 deposit with zero amount", async function () {
      const guardAddr = await guard.getAddress();
      const tokenAddr = await mockToken.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("TOKEN-INV-001");

      const teeSig = await signInboundTokenAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr, tokenAddr,
        0n, 0, now + 3600, inv
      );

      await expect(
        guard.connect(payer).attestedTokenDeposit(
          tokenAddr, 0, inv, 0, now + 3600, teeSig
        )
      ).to.be.revertedWithCustomError(guard, "ZeroValue");
    });
  });

  describe("Outbound — checkTransaction via Safe.execTransaction", function () {
    beforeEach(async function () {
      // Fund Safe with ETH via attestedDeposit
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("FUND");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("5"), 0, now + 3600, inv
      );

      await guard.connect(payer).attestedDeposit(inv, 0, now + 3600, teeSig, {
        value: ethers.parseEther("5"),
      });
    });

    it("allows ETH send with valid TEE attestation", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");
      const deadline = now + 3600;

      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, inv
      );

      const recipientBefore = await ethers.provider.getBalance(recipient.address);

      await execSafeWithAttestation(
        safe, owner, recipient.address,
        ethers.parseEther("1"), "0x",
        1, deadline, inv, outSig
      );

      const recipientAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientAfter - recipientBefore).to.equal(ethers.parseEther("1"));
    });

    it("reverts Safe tx if attestation signer is wrong", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");
      const deadline = now + 3600;

      // Sign with attacker
      const badSig = await signOutboundAttestation(
        attacker, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, inv
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          1, deadline, inv, badSig
        )
      ).to.be.reverted;
    });

    it("reverts Safe tx if nonce replayed", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const inv1 = invoiceId("OUT-001");
      const inv2 = invoiceId("OUT-002");
      const deadline = now + 3600;

      // First tx with nonce 1
      const outSig1 = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, inv1
      );

      await execSafeWithAttestation(
        safe, owner, recipient.address,
        ethers.parseEther("1"), "0x",
        1, deadline, inv1, outSig1
      );

      // Second tx reusing nonce 1
      const outSig2 = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, inv2
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          1, deadline, inv2, outSig2
        )
      ).to.be.reverted;
    });

    it("reverts Safe tx if deadline expired", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");
      const deadline = now + 60; // 60 seconds from now

      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, inv
      );

      // Advance time past the deadline
      await advanceTime(120);

      await expect(
        execSafeWithAttestation(
          safe, owner, recipient.address,
          ethers.parseEther("1"), "0x",
          1, deadline, inv, outSig
        )
      ).to.be.reverted;
    });

    it("reverts Safe tx if destination doesn't match", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("OUT-001");
      const deadline = now + 3600;

      // Sign for recipient but send to attacker
      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, recipient.address,
        ethers.parseEther("1"), 1, deadline, inv
      );

      await expect(
        execSafeWithAttestation(
          safe, owner, attacker.address, // wrong destination
          ethers.parseEther("1"), "0x",
          1, deadline, inv, outSig
        )
      ).to.be.reverted;
    });
  });

  describe("Admin", function () {
    it("Safe can update TEE signer", async function () {
      const safeAddr = await safe.getAddress();
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();

      // Encode setTeeSigner call on guard
      const setSignerData = guard.interface.encodeFunctionData("setTeeSigner", [
        attacker.address, // new signer
      ]);

      // Execute via Safe (need TEE attestation for outbound)
      const inv = invoiceId("ADMIN-001");
      const deadline = now + 3600;

      const outSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, guardAddr,
        0n, 0, deadline, inv
      );

      await execSafeWithAttestation(
        safe, owner, guardAddr,
        0n, setSignerData,
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
      const safeAddr = await safe.getAddress();
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();

      // Rotate signer to attacker
      const setSignerData = guard.interface.encodeFunctionData("setTeeSigner", [
        attacker.address,
      ]);
      const inv1 = invoiceId("ADMIN-ROTATE");
      const deadline = now + 3600;

      const rotSig = await signOutboundAttestation(
        teeSigner, guardAddr, chainId,
        safeAddr, guardAddr, 0n, 0, deadline, inv1
      );

      await execSafeWithAttestation(
        safe, owner, guardAddr, 0n, setSignerData,
        0, deadline, inv1, rotSig
      );

      // Now try to deposit with old TEE signer
      const inv2 = invoiceId("OLD-SIGNER");
      const oldSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 1, deadline, inv2
      );

      await expect(
        guard.connect(payer).attestedDeposit(inv2, 1, deadline, oldSig, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });
  });

  describe("Direct transfer blocking", function () {
    it("reverts on bare ETH send (no calldata)", async function () {
      await expect(
        payer.sendTransaction({
          to: await guard.getAddress(),
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(guard, "DirectTransferBlocked");
    });
  });

  describe("Fallback — raw ETH send with attestation in calldata", function () {
    it("accepts ETH via raw send with valid attestation in calldata", async function () {
      const guardAddr = await guard.getAddress();
      const safeAddr = await safe.getAddress();
      const now = await currentTimestamp();
      const deadline = now + 3600;
      const inv = invoiceId("RAW-INV-001");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, deadline, inv
      );

      // Pack calldata: invoiceId (32) | nonce (32) | deadline (32) | teeSignature (65)
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const packed = abiCoder.encode(
        ["bytes32", "uint256", "uint256"],
        [inv, 0, deadline]
      );
      const calldata = ethers.concat([packed, teeSig]); // 96 + 65 = 161 bytes

      await payer.sendTransaction({
        to: guardAddr,
        value: ethers.parseEther("1"),
        data: calldata,
      });

      expect(await ethers.provider.getBalance(safeAddr)).to.equal(
        ethers.parseEther("1")
      );
    });

    it("reverts raw send with wrong TEE signer", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("RAW-INV-002");

      const badSig = await signInboundAttestation(
        attacker, guardAddr, chainId,
        payer.address, guardAddr,
        ethers.parseEther("1"), 0, now + 3600, inv
      );

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const packed = abiCoder.encode(
        ["bytes32", "uint256", "uint256"],
        [inv, 0, now + 3600]
      );
      const calldata = ethers.concat([packed, badSig]);

      await expect(
        payer.sendTransaction({
          to: guardAddr,
          value: ethers.parseEther("1"),
          data: calldata,
        })
      ).to.be.revertedWithCustomError(guard, "InvalidSignature");
    });

    it("reverts raw send with invalid calldata length", async function () {
      await expect(
        payer.sendTransaction({
          to: await guard.getAddress(),
          value: ethers.parseEther("1"),
          data: "0xdeadbeef", // 4 bytes, not 161
        })
      ).to.be.reverted;
    });

    it("reverts raw send with zero value", async function () {
      const guardAddr = await guard.getAddress();
      const now = await currentTimestamp();
      const inv = invoiceId("RAW-INV-003");

      const teeSig = await signInboundAttestation(
        teeSigner, guardAddr, chainId,
        payer.address, guardAddr,
        0n, 0, now + 3600, inv
      );

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const packed = abiCoder.encode(
        ["bytes32", "uint256", "uint256"],
        [inv, 0, now + 3600]
      );
      const calldata = ethers.concat([packed, teeSig]);

      await expect(
        payer.sendTransaction({
          to: guardAddr,
          value: 0,
          data: calldata,
        })
      ).to.be.revertedWithCustomError(guard, "ZeroValue");
    });
  });
});
