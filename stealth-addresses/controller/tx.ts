import { sign, getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import type { Runtime } from "@chainlink/cre-sdk";
import { rpcCall } from "./rpc";

// Minimal RLP encoding
function rlpEncodeLength(len: number, offset: number): Uint8Array {
    if (len < 56) return new Uint8Array([len + offset]);
    const hexLen = len.toString(16);
    const lenBytes = hexToBytes(hexLen.length % 2 ? "0" + hexLen : hexLen);
    return new Uint8Array([offset + 55 + lenBytes.length, ...lenBytes]);
}

function rlpEncodeBytes(data: Uint8Array): Uint8Array {
    if (data.length === 1 && data[0] < 0x80) return data;
    const prefix = rlpEncodeLength(data.length, 0x80);
    const result = new Uint8Array(prefix.length + data.length);
    result.set(prefix);
    result.set(data, prefix.length);
    return result;
}

function rlpEncodeList(items: Uint8Array[]): Uint8Array {
    let totalLen = 0;
    for (const item of items) totalLen += item.length;
    const prefix = rlpEncodeLength(totalLen, 0xc0);
    const result = new Uint8Array(prefix.length + totalLen);
    result.set(prefix);
    let offset = prefix.length;
    for (const item of items) {
        result.set(item, offset);
        offset += item.length;
    }
    return result;
}

function bigintToBytes(val: bigint): Uint8Array {
    if (val === 0n) return new Uint8Array(0);
    let hex = val.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    return hexToBytes(hex);
}

function rlpEncodeBigint(val: bigint): Uint8Array {
    return rlpEncodeBytes(bigintToBytes(val));
}

// Sign and send an EIP-1559 (type 2) transaction
export function signAndSendTx(
    runtime: Runtime<any>,
    rpcUrl: string,
    privateKey: string,
    params: {
        to?: string;  // undefined for contract creation
        data: string;
        value?: bigint;
        nonce: bigint;
        gasLimit: bigint;
        maxFeePerGas: bigint;
        maxPriorityFeePerGas: bigint;
        chainId: bigint;
    },
): string {
    const { to, data, value = 0n, nonce, gasLimit, maxFeePerGas, maxPriorityFeePerGas, chainId } = params;
    const privKeyBytes = hexToBytes(privateKey.replace(/^0x/, ""));

    const toBytes = to ? hexToBytes(to.replace(/^0x/, "")) : new Uint8Array(0);
    const dataBytes = hexToBytes(data.replace(/^0x/, ""));

    // EIP-1559 unsigned: [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList]
    const unsignedItems = [
        rlpEncodeBigint(chainId),
        rlpEncodeBigint(nonce),
        rlpEncodeBigint(maxPriorityFeePerGas),
        rlpEncodeBigint(maxFeePerGas),
        rlpEncodeBigint(gasLimit),
        rlpEncodeBytes(toBytes),
        rlpEncodeBigint(value),
        rlpEncodeBytes(dataBytes),
        rlpEncodeList([]),  // empty access list
    ];
    const unsignedPayload = rlpEncodeList(unsignedItems);

    // Signing hash = keccak256(0x02 || RLP(unsigned))
    const toSign = new Uint8Array(1 + unsignedPayload.length);
    toSign[0] = 0x02;
    toSign.set(unsignedPayload, 1);
    const txHash = keccak_256(toSign);

    // Sign with recovery
    const sig = sign(txHash, privKeyBytes, {
        prehash: false,
        lowS: true,
        format: "recovered",
    });

    // noble/secp256k1 v3 format:"recovered" layout: [recovery(1), r(32), s(32)]
    const yParity = BigInt(sig[0]); // 0 or 1
    const rBigint = BigInt("0x" + bytesToHex(sig.slice(1, 33)));
    const sBigint = BigInt("0x" + bytesToHex(sig.slice(33, 65)));

    // Signed: 0x02 || RLP([chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gasLimit, to, value, data, accessList, yParity, r, s])
    const signedItems = [
        rlpEncodeBigint(chainId),
        rlpEncodeBigint(nonce),
        rlpEncodeBigint(maxPriorityFeePerGas),
        rlpEncodeBigint(maxFeePerGas),
        rlpEncodeBigint(gasLimit),
        rlpEncodeBytes(toBytes),
        rlpEncodeBigint(value),
        rlpEncodeBytes(dataBytes),
        rlpEncodeList([]),  // empty access list
        rlpEncodeBigint(yParity),
        rlpEncodeBigint(rBigint),
        rlpEncodeBigint(sBigint),
    ];
    const signedPayload = rlpEncodeList(signedItems);

    // Final raw tx: 0x02 || signedPayload
    const rawTxBytes = new Uint8Array(1 + signedPayload.length);
    rawTxBytes[0] = 0x02;
    rawTxBytes.set(signedPayload, 1);
    const rawTx = "0x" + bytesToHex(rawTxBytes);

    return rpcCall(runtime, rpcUrl, "eth_sendRawTransaction", [rawTx]);
}

// Wait for tx receipt with polling (Base Sepolia ~2s block time)
export function waitForReceipt(
    runtime: Runtime<any>,
    rpcUrl: string,
    txHash: string,
    maxAttempts: number = 3,
): any {
    for (let i = 0; i < maxAttempts; i++) {
        const receipt = rpcCall(runtime, rpcUrl, "eth_getTransactionReceipt", [txHash]);
        if (receipt) return receipt;
    }
    throw new Error(`Transaction ${txHash} not found after ${maxAttempts} attempts`);
}

// Get contract address from deployment tx receipt
export function getDeployedAddress(receipt: any): string {
    if (!receipt.contractAddress) {
        throw new Error("No contract address in receipt");
    }
    return receipt.contractAddress;
}

// Helper: deploy a contract and return its address
export function deployContract(
    runtime: Runtime<any>,
    rpcUrl: string,
    privateKey: string,
    bytecode: string,
    nonce: bigint,
    maxFeePerGas: bigint,
    chainId: bigint,
    gasLimit: bigint = 5000000n,
): string {
    const txHash = signAndSendTx(runtime, rpcUrl, privateKey, {
        data: bytecode,
        nonce,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas: 1000000n, // 0.001 gwei
        chainId,
    });
    const receipt = waitForReceipt(runtime, rpcUrl, txHash);
    return getDeployedAddress(receipt);
}
