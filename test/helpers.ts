/**
 * Test helpers for deploying Safes, signing outbound TEE attestations, and executing Safe txs.
 */

import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// EIP-712 domain for SpectreGuard
function getGuardDomain(guardAddress: string, chainId: number) {
  return {
    name: "SpectreGuard",
    version: "1",
    chainId,
    verifyingContract: guardAddress,
  };
}

// Cache singleton and factory across tests for efficiency
let safeSingleton: any = null;
let safeProxyFactory: any = null;
let saltNonce = 0;

/**
 * Deploy a Safe proxy using the proxy factory pattern.
 */
export async function deploySafe(
  owners: string[],
  threshold: number
): Promise<ethers.Contract> {
  if (!safeSingleton) {
    const SafeFactory = await ethers.getContractFactory("Safe");
    safeSingleton = await SafeFactory.deploy();
    await safeSingleton.waitForDeployment();
  }

  if (!safeProxyFactory) {
    const FactoryFactory = await ethers.getContractFactory("SafeProxyFactory");
    safeProxyFactory = await FactoryFactory.deploy();
    await safeProxyFactory.waitForDeployment();
  }

  const singletonAddr = await safeSingleton.getAddress();
  const safeInterface = safeSingleton.interface;
  const initializer = safeInterface.encodeFunctionData("setup", [
    owners, threshold,
    ethers.ZeroAddress, "0x", ethers.ZeroAddress,
    ethers.ZeroAddress, 0, ethers.ZeroAddress,
  ]);

  const tx = await safeProxyFactory.createProxyWithNonce(singletonAddr, initializer, saltNonce++);
  const receipt = await tx.wait();

  const proxyCreationEvent = receipt.logs.find((log: any) => {
    try { return safeProxyFactory!.interface.parseLog(log)?.name === "ProxyCreation"; }
    catch { return false; }
  });
  if (!proxyCreationEvent) throw new Error("ProxyCreation event not found");

  const parsed = safeProxyFactory.interface.parseLog(proxyCreationEvent);
  const proxyAddress = parsed!.args[0];

  return new ethers.Contract(proxyAddress, safeInterface, (await ethers.getSigners())[0]);
}

/**
 * Send ETH directly to a Safe (normal transfer — no guard involved).
 */
export async function fundSafe(
  from: HardhatEthersSigner,
  safeAddress: string,
  amount: bigint
): Promise<void> {
  await from.sendTransaction({ to: safeAddress, value: amount });
}

/**
 * Build a Safe owner signature for a transaction hash.
 */
export async function buildSafeSignature(
  safe: ethers.Contract,
  signer: HardhatEthersSigner,
  to: string,
  value: bigint,
  data: string,
  operation: number = 0
): Promise<{ safeTxHash: string; signature: string; safeNonce: bigint }> {
  const safeNonce = await safe.nonce();
  const txHash = await safe.getTransactionHash(
    to, value, data, operation, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress, safeNonce
  );

  const sig = await signer.signMessage(ethers.getBytes(txHash));
  const sigBytes = ethers.getBytes(sig);
  sigBytes[64] += 4; // Safe eth_sign v adjustment

  return { safeTxHash: txHash, signature: ethers.hexlify(sigBytes), safeNonce };
}

/**
 * Pack TEE attestation data to append to Safe signatures.
 * Format: [nonce (32)][deadline (32)][invoiceId (32)][teeSignature (65)]
 */
export function packTeeAttestation(
  nonce: number,
  deadline: number,
  invoiceId: string,
  teeSignature: string
): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const packed = abiCoder.encode(
    ["uint256", "uint256", "bytes32"],
    [nonce, deadline, invoiceId]
  );
  return ethers.concat([packed, teeSignature]);
}

/**
 * Execute a Safe transaction with TEE attestation appended to signatures.
 */
export async function execSafeWithAttestation(
  safe: ethers.Contract,
  owner: HardhatEthersSigner,
  to: string,
  value: bigint,
  data: string,
  teeNonce: number,
  teeDeadline: number,
  invoiceId: string,
  teeSignature: string
): Promise<ethers.ContractTransactionResponse> {
  const { signature: safeSig } = await buildSafeSignature(safe, owner, to, value, data, 0);
  const teeData = packTeeAttestation(teeNonce, teeDeadline, invoiceId, teeSignature);
  const combinedSigs = ethers.concat([safeSig, teeData]);

  return safe.execTransaction(
    to, value, data, 0, 0, 0, 0,
    ethers.ZeroAddress, ethers.ZeroAddress, combinedSigs
  );
}

/**
 * Sign an outbound TEE attestation.
 */
export async function signOutboundAttestation(
  teeWallet: ethers.Wallet | HardhatEthersSigner,
  guardAddress: string,
  chainId: number,
  safeAddress: string,
  to: string,
  value: bigint,
  nonce: number,
  deadline: number,
  invoiceId: string
): Promise<string> {
  const domain = getGuardDomain(guardAddress, chainId);
  const types = {
    SpectreOutbound: [
      { name: "safe", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "invoiceId", type: "bytes32" },
    ],
  };
  return teeWallet.signTypedData(domain, types, {
    safe: safeAddress, to, value, nonce, deadline, invoiceId,
  });
}

/**
 * Sign an inbound TEE attestation for deposit via guard fallback.
 */
export async function signInboundAttestation(
  teeWallet: ethers.Wallet | HardhatEthersSigner,
  guardAddress: string,
  chainId: number,
  from: string,
  value: bigint,
  nonce: number,
  deadline: number,
  invoiceId: string
): Promise<string> {
  const domain = getGuardDomain(guardAddress, chainId);
  const types = {
    SpectreInbound: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "invoiceId", type: "bytes32" },
    ],
  };
  return teeWallet.signTypedData(domain, types, {
    from, to: guardAddress, value, nonce, deadline, invoiceId,
  });
}

/**
 * Pack inbound attestation calldata for sending to guard fallback.
 * Format: invoiceId (32) | nonce (32) | deadline (32) | teeSignature (65) = 161 bytes
 */
export function packInboundCalldata(
  invoiceId: string,
  nonce: number,
  deadline: number,
  teeSignature: string
): string {
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const packed = abiCoder.encode(
    ["bytes32", "uint256", "uint256"],
    [invoiceId, nonce, deadline]
  );
  return ethers.concat([packed, teeSignature]);
}

/**
 * Send ETH to the guard address with inbound TEE attestation in calldata.
 */
export async function sendAttestedDeposit(
  from: HardhatEthersSigner,
  guardAddress: string,
  value: bigint,
  invoiceId: string,
  nonce: number,
  deadline: number,
  teeSignature: string
): Promise<any> {
  const data = packInboundCalldata(invoiceId, nonce, deadline, teeSignature);
  return from.sendTransaction({ to: guardAddress, value, data });
}

/** Generate a deterministic invoiceId from a string. */
export function invoiceId(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

/** Get the current block timestamp. */
export async function currentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

/** Advance the block timestamp by a given number of seconds. */
export async function advanceTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}
