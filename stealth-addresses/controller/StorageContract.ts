import type { Runtime } from "@chainlink/cre-sdk";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
    functionSelector, encodeSingleString, encodeTwoStrings,
    encodeCalldata, ethCall, decodeUint256, decodeString, ethGetNonce,
} from "./rpc";
import { signAndSendTx } from "./tx";

const SEL_GET_NONCE = functionSelector("getNonce(string)");
const SEL_INCREMENT_NONCE = functionSelector("incrementNonce(string)");
const SEL_GET_WNS = functionSelector("getWns(string)");
const SEL_SET_WNS = functionSelector("setWns(string,string)");

function computeAddress(privateKey: string): string {
    const pubKey = getPublicKey(hexToBytes(privateKey.replace(/^0x/, "")), false);
    return "0x" + bytesToHex(keccak_256(pubKey.slice(1))).slice(-40);
}

export const getNonce = (
    runtime: Runtime<any>,
    contractAddress: string,
    rpcUrl: string,
    wnsId: string,
    privateKey?: string,
): bigint => {
    const data = encodeCalldata(SEL_GET_NONCE, encodeSingleString(wnsId));
    const from = privateKey ? computeAddress(privateKey) : undefined;
    const result = ethCall(runtime, rpcUrl, contractAddress, data, from);
    return decodeUint256(result);
};

export const incrementNonce = (
    runtime: Runtime<any>,
    contractAddress: string,
    rpcUrl: string,
    privateKey: string,
    wnsId: string,
    chainId: bigint = 84532n,
): void => {
    const data = encodeCalldata(SEL_INCREMENT_NONCE, encodeSingleString(wnsId));
    const from = computeAddress(privateKey);
    const nonce = ethGetNonce(runtime, rpcUrl, from);
    signAndSendTx(runtime, rpcUrl, privateKey, {
        to: contractAddress,
        data,
        nonce,
        gasLimit: 200000n,
        maxFeePerGas: 10000000n,
        maxPriorityFeePerGas: 1000000n,
        chainId,
    });
};

export const storeEncryptedAddress = (
    runtime: Runtime<any>,
    contractAddress: string,
    rpcUrl: string,
    privateKey: string,
    wnsId: string,
    encryptedValue: string,
    chainId: bigint = 84532n,
): void => {
    const data = encodeCalldata(SEL_SET_WNS, encodeTwoStrings(wnsId, encryptedValue));
    const from = computeAddress(privateKey);
    const nonce = ethGetNonce(runtime, rpcUrl, from);
    signAndSendTx(runtime, rpcUrl, privateKey, {
        to: contractAddress,
        data,
        nonce,
        gasLimit: 500000n,
        maxFeePerGas: 10000000n,
        maxPriorityFeePerGas: 1000000n,
        chainId,
    });
};

export const getEncryptedAddress = (
    runtime: Runtime<any>,
    contractAddress: string,
    rpcUrl: string,
    wnsId: string,
    privateKey?: string,
): string => {
    const data = encodeCalldata(SEL_GET_WNS, encodeSingleString(wnsId));
    const from = privateKey ? computeAddress(privateKey) : undefined;
    const result = ethCall(runtime, rpcUrl, contractAddress, data, from);
    return decodeString(result);
};
