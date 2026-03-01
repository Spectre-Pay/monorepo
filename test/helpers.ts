/**
 * Test helpers for deploying Safes, signing transactions, and building TEE attestations.
 */

import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { SpectreGuard, MockERC20 } from "../typechain-types";

// Safe contract ABIs/artifacts - we use the compiled Safe from @safe-global/safe-contracts
const SAFE_ABI = [
  "function setup(address[] calldata _owners, uint256 _threshold, address to, bytes calldata data, address fallbackHandler, address paymentToken, uint256 payment, address payable paymentReceiver) external",
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, uint256 _nonce) public view returns (bytes32)",
  "function setGuard(address guard) external",
  "function nonce() public view returns (uint256)",
  "function getOwners() public view returns (address[])",
  "function getThreshold() public view returns (uint256)",
  "receive() external payable",
];

// EIP-712 domain for SpectreGuard
interface EIP712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

function getGuardDomain(guardAddress: string, chainId: number): EIP712Domain {
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
 * Deploy a Safe proxy using the proxy factory pattern (required by Safe).
 * The singleton is deployed once and reused; proxies are created for each Safe.
 */
export async function deploySafe(
  owners: string[],
  threshold: number
): Promise<ethers.Contract> {
  // Deploy singleton (once)
  if (!safeSingleton) {
    const SafeFactory = await ethers.getContractFactory("Safe");
    safeSingleton = await SafeFactory.deploy();
    await safeSingleton.waitForDeployment();
  }

  // Deploy proxy factory (once)
  if (!safeProxyFactory) {
    const FactoryFactory = await ethers.getContractFactory("SafeProxyFactory");
    safeProxyFactory = await FactoryFactory.deploy();
    await safeProxyFactory.waitForDeployment();
  }

  const singletonAddr = await safeSingleton.getAddress();

  // Encode the setup() call as the initializer
  const safeInterface = safeSingleton.interface;
  const initializer = safeInterface.encodeFunctionData("setup", [
    owners,
    threshold,
    ethers.ZeroAddress, // to
    "0x", // data
    ethers.ZeroAddress, // fallbackHandler
    ethers.ZeroAddress, // paymentToken
    0, // payment
    ethers.ZeroAddress, // paymentReceiver
  ]);

  // Create proxy via factory
  const tx = await safeProxyFactory.createProxyWithNonce(
    singletonAddr,
    initializer,
    saltNonce++
  );
  const receipt = await tx.wait();

  // Extract proxy address from ProxyCreation event
  const proxyCreationEvent = receipt.logs.find((log: any) => {
    try {
      return safeProxyFactory!.interface.parseLog(log)?.name === "ProxyCreation";
    } catch {
      return false;
    }
  });

  if (!proxyCreationEvent) {
    throw new Error("ProxyCreation event not found");
  }

  const parsed = safeProxyFactory.interface.parseLog(proxyCreationEvent);
  const proxyAddress = parsed!.args[0];

  // Return the proxy as a Safe contract instance
  return new ethers.Contract(proxyAddress, safeInterface, (await ethers.getSigners())[0]);
}

/**
 * Build a Safe owner signature for a transaction hash.
 * For a 1-of-1 Safe, this is just a standard ECDSA signature.
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
    to,
    value,
    data,
    operation,
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    safeNonce
  );

  // Sign the tx hash — Safe expects (r, s, v) packed as 65 bytes
  const sig = await signer.signMessage(ethers.getBytes(txHash));

  // ethers signMessage produces EIP-191 signature. Safe expects eth_sign style.
  // We need to adjust v: Safe checks v > 30 for eth_sign, so we add 4 to v.
  const sigBytes = ethers.getBytes(sig);
  sigBytes[64] += 4; // Safe eth_sign adjustment

  return {
    safeTxHash: txHash,
    signature: ethers.hexlify(sigBytes),
    safeNonce,
  };
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
  // packed is 96 bytes (3 x 32), append the 65-byte TEE signature
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
  const { signature: safeSig } = await buildSafeSignature(
    safe,
    owner,
    to,
    value,
    data,
    0 // Call
  );

  const teeData = packTeeAttestation(
    teeNonce,
    teeDeadline,
    invoiceId,
    teeSignature
  );

  // Combine Safe signature + TEE attestation data
  const combinedSigs = ethers.concat([safeSig, teeData]);

  return safe.execTransaction(
    to,
    value,
    data,
    0, // Call
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    combinedSigs
  );
}

/**
 * Sign an inbound ETH attestation using an ethers Wallet (simulating TEE).
 */
export async function signInboundAttestation(
  teeWallet: ethers.Wallet | HardhatEthersSigner,
  guardAddress: string,
  chainId: number,
  from: string,
  to: string,
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
  const message = { from, to, value, nonce, deadline, invoiceId };

  return teeWallet.signTypedData(domain, types, message);
}

/**
 * Sign an inbound ERC-20 token attestation.
 */
export async function signInboundTokenAttestation(
  teeWallet: ethers.Wallet | HardhatEthersSigner,
  guardAddress: string,
  chainId: number,
  from: string,
  to: string,
  token: string,
  amount: bigint,
  nonce: number,
  deadline: number,
  invoiceId: string
): Promise<string> {
  const domain = getGuardDomain(guardAddress, chainId);
  const types = {
    SpectreInboundToken: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "invoiceId", type: "bytes32" },
    ],
  };
  const message = { from, to, token, amount, nonce, deadline, invoiceId };

  return teeWallet.signTypedData(domain, types, message);
}

/**
 * Sign an outbound attestation.
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
  const message = { safe: safeAddress, to, value, nonce, deadline, invoiceId };

  return teeWallet.signTypedData(domain, types, message);
}

/**
 * Generate a deterministic invoiceId from a string.
 */
export function invoiceId(label: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(label));
}

/**
 * Get the current block timestamp.
 */
export async function currentTimestamp(): Promise<number> {
  const block = await ethers.provider.getBlock("latest");
  return block!.timestamp;
}

/**
 * Advance the block timestamp by a given number of seconds.
 */
export async function advanceTime(seconds: number): Promise<void> {
  await ethers.provider.send("evm_increaseTime", [seconds]);
  await ethers.provider.send("evm_mine", []);
}
