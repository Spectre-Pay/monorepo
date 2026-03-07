import { cre } from "@chainlink/cre-sdk";
import type { Runtime } from "@chainlink/cre-sdk";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const httpClient = new cre.capabilities.HTTPClient();

// Minimal ABI encoding helpers (no ethers dependency)

export function functionSelector(signature: string): string {
    const hash = keccak_256(utf8ToBytes(signature));
    return bytesToHex(hash).slice(0, 8);
}

function padLeft(hex: string, bytes: number = 32): string {
    return hex.padStart(bytes * 2, "0");
}

function encodeUint256(value: bigint | number): string {
    return padLeft(BigInt(value).toString(16));
}

function encodeAddress(addr: string): string {
    return padLeft(addr.replace(/^0x/, "").toLowerCase());
}

function encodeString(str: string): string {
    const hexStr = bytesToHex(utf8ToBytes(str));
    const len = encodeUint256(str.length);
    const padded = hexStr.padEnd(Math.ceil(hexStr.length / 64) * 64, "0");
    return len + padded;
}

// Encode a single string parameter with offset
export function encodeSingleString(str: string): string {
    const offset = encodeUint256(32); // offset to dynamic data
    return offset + encodeString(str);
}

// Encode two string parameters with offsets
export function encodeTwoStrings(str1: string, str2: string): string {
    const encoded1 = encodeString(str1);
    const encoded2 = encodeString(str2);
    const offset1 = encodeUint256(64); // 2 * 32 bytes for two offsets
    const offset2 = encodeUint256(64 + encoded1.length / 2);
    return offset1 + offset2 + encoded1 + encoded2;
}

export function encodeCalldata(selector: string, params: string): string {
    return "0x" + selector + params;
}

// Make a JSON-RPC call via CRE HTTPClient
export function rpcCall(
    runtime: Runtime<any>,
    rpcUrl: string,
    method: string,
    params: any[],
): any {
    const body = JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
        id: 1,
    });

    const response = httpClient.sendRequest(runtime, {
        url: rpcUrl,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: new TextEncoder().encode(body),
    }).result();

    const responseBody = new TextDecoder().decode(response.body);
    const parsed = JSON.parse(responseBody);
    if (parsed.error) {
        throw new Error(`RPC error: ${JSON.stringify(parsed.error)}`);
    }
    return parsed.result;
}

// eth_call helper
export function ethCall(
    runtime: Runtime<any>,
    rpcUrl: string,
    to: string,
    data: string,
    from?: string,
): string {
    const callObj: any = { to, data };
    if (from) callObj.from = from;
    return rpcCall(runtime, rpcUrl, "eth_call", [callObj, "latest"]);
}

// eth_sendRawTransaction helper (for pre-signed txs)
export function ethSendRawTransaction(
    runtime: Runtime<any>,
    rpcUrl: string,
    signedTx: string,
): string {
    return rpcCall(runtime, rpcUrl, "eth_sendRawTransaction", [signedTx]);
}

// eth_getTransactionCount
export function ethGetNonce(
    runtime: Runtime<any>,
    rpcUrl: string,
    address: string,
): bigint {
    const result = rpcCall(runtime, rpcUrl, "eth_getTransactionCount", [address, "latest"]);
    return BigInt(result);
}

// eth_chainId
export function ethChainId(
    runtime: Runtime<any>,
    rpcUrl: string,
): bigint {
    const result = rpcCall(runtime, rpcUrl, "eth_chainId", []);
    return BigInt(result);
}

// eth_gasPrice
export function ethGasPrice(
    runtime: Runtime<any>,
    rpcUrl: string,
): bigint {
    const result = rpcCall(runtime, rpcUrl, "eth_gasPrice", []);
    return BigInt(result);
}

// Decode a uint256 from hex RPC response
export function decodeUint256(hex: string): bigint {
    const clean = hex.replace(/^0x/, "");
    return BigInt("0x" + clean);
}

// Decode a string from ABI-encoded response
export function decodeString(hex: string): string {
    const clean = hex.replace(/^0x/, "");
    // First 32 bytes = offset, next 32 bytes = length, then data
    const offset = parseInt(clean.slice(0, 64), 16) * 2;
    const len = parseInt(clean.slice(offset, offset + 64), 16);
    const dataHex = clean.slice(offset + 64, offset + 64 + len * 2);
    const bytes = hexToBytes(dataHex);
    return new TextDecoder().decode(bytes);
}
