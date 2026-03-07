import type { Runtime } from "@chainlink/cre-sdk";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import {
    functionSelector, encodeSingleString, encodeTwoStrings,
    encodeCalldata, ethCall, decodeString, ethGetNonce,
} from "./rpc";
import { signAndSendTx, waitForReceipt } from "./tx";

const SEL_SET_STEALTH = functionSelector("setStealthAddress(string,string)");
const SEL_GET_STEALTH = functionSelector("getStealthAddress(string)");

function computeAddress(privateKey: string): string {
    const pubKey = getPublicKey(hexToBytes(privateKey.replace(/^0x/, "")), false);
    return "0x" + bytesToHex(keccak_256(pubKey.slice(1))).slice(-40);
}

export const setStealthAddress = (
    runtime: Runtime<any>,
    contractAddress: string,
    rpcUrl: string,
    privateKey: string,
    worldId: string,
    stealthAddr: string,
    chainId: bigint = 84532n,
): void => {
    const data = encodeCalldata(SEL_SET_STEALTH, encodeTwoStrings(worldId, stealthAddr));
    const from = computeAddress(privateKey);
    const nonce = ethGetNonce(runtime, rpcUrl, from);
    const txHash = signAndSendTx(runtime, rpcUrl, privateKey, {
        to: contractAddress,
        data,
        nonce,
        gasLimit: 500000n,
        maxFeePerGas: 10000000n,
        maxPriorityFeePerGas: 1000000n,
        chainId,
    });
    const receipt = waitForReceipt(runtime, rpcUrl, txHash);
    if (receipt.status === "0x0") {
        throw new Error(`setStealthAddress tx failed: ${txHash}`);
    }
};

export const getStealthAddress = (
    runtime: Runtime<any>,
    contractAddress: string,
    rpcUrl: string,
    privateKey: string,
    worldId: string,
): string => {
    const data = encodeCalldata(SEL_GET_STEALTH, encodeSingleString(worldId));
    const from = computeAddress(privateKey);
    const result = ethCall(runtime, rpcUrl, contractAddress, data, from);
    return decodeString(result);
};
