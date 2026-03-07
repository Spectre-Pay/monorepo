import type { Runtime } from "@chainlink/cre-sdk";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { SafeArtifact, SafeProxyFactoryArtifact, SpectreGuardArtifact } from "./bytecodes";
import { functionSelector, ethGasPrice, ethGetNonce, ethChainId } from "./rpc";
import { signAndSendTx, waitForReceipt, deployContract } from "./tx";

// Minimal ABI encoding helpers
export function padLeft(hex: string, bytes: number = 32): string {
    return hex.padStart(bytes * 2, "0");
}

function encodeAddress(addr: string): string {
    return padLeft(addr.replace(/^0x/, "").toLowerCase());
}

function encodeUint256(val: bigint | number): string {
    return padLeft(BigInt(val).toString(16));
}

// Encode Safe.setup(address[],uint256,address,bytes,address,address,uint256,address)
export function encodeSafeSetup(ownerAddress: string): string {
    const sel = functionSelector("setup(address[],uint256,address,bytes,address,address,uint256,address)");
    const zero = encodeUint256(0);
    const zeroAddr = encodeAddress("0x0000000000000000000000000000000000000000");

    // 8 params, first (owners) and fourth (data) are dynamic
    const ownersOffset = encodeUint256(8 * 32);
    const threshold = encodeUint256(1);
    const dataOffset = encodeUint256(8 * 32 + 2 * 32); // owners: len(32) + 1 addr(32)

    // Owners array: [length=1, owner]
    const ownersLen = encodeUint256(1);
    const owner = encodeAddress(ownerAddress);

    // Empty bytes: [length=0]
    const bytesLen = encodeUint256(0);

    return "0x" + sel + ownersOffset + threshold + zeroAddr + dataOffset +
        zeroAddr + zeroAddr + zero + zeroAddr +
        ownersLen + owner + bytesLen;
}

// Encode createProxyWithNonce(address,bytes,uint256)
export function encodeCreateProxy(singletonAddr: string, setupData: string, saltNonce: number): string {
    const sel = functionSelector("createProxyWithNonce(address,bytes,uint256)");
    const singleton = encodeAddress(singletonAddr);
    const salt = encodeUint256(saltNonce);
    const bytesOffset = encodeUint256(3 * 32);

    const setupBytes = hexToBytes(setupData.replace(/^0x/, ""));
    const bytesLen = encodeUint256(setupBytes.length);
    const bytesHex = bytesToHex(setupBytes);
    const padded = bytesHex.padEnd(Math.ceil(bytesHex.length / 64) * 64, "0");

    return "0x" + sel + singleton + bytesOffset + salt + bytesLen + padded;
}

// Encode setGuard(address)
export function encodeSetGuard(guardAddr: string): string {
    const sel = functionSelector("setGuard(address)");
    return "0x" + sel + encodeAddress(guardAddr);
}

// Compute address from private key
export function computeAddress(privateKey: string): string {
    const pubKey = getPublicKey(hexToBytes(privateKey.replace(/^0x/, "")), false);
    return "0x" + bytesToHex(keccak_256(pubKey.slice(1))).slice(-40);
}

export interface DeployResult {
    safeSingleton: string;
    safeProxyFactory: string;
    safeProxy: string;
    spectreGuard: string;
    setGuardCalldata: string;
}

export function deploySafeWithGuard(
    runtime: Runtime<any>,
    params: {
        rpcUrl: string;
        deployerPrivateKey: string;
        ownerAddress: string;
        teeSignerAddress: string;
        saltNonce: number;
    },
): DeployResult {
    const { rpcUrl, deployerPrivateKey, ownerAddress, teeSignerAddress, saltNonce } = params;

    const from = computeAddress(deployerPrivateKey);
    let nonce = ethGetNonce(runtime, rpcUrl, from);
    const gasPrice = ethGasPrice(runtime, rpcUrl);
    const chainId = ethChainId(runtime, rpcUrl);

    // 1. Deploy Safe singleton
    const safeSingletonAddr = deployContract(
        runtime, rpcUrl, deployerPrivateKey,
        SafeArtifact.bytecode, nonce, gasPrice, chainId,
    );
    nonce++;

    // 2. Deploy SafeProxyFactory
    const proxyFactoryAddr = deployContract(
        runtime, rpcUrl, deployerPrivateKey,
        SafeProxyFactoryArtifact.bytecode, nonce, gasPrice, chainId,
    );
    nonce++;

    // 3. Create Safe proxy with owner
    const setupData = encodeSafeSetup(ownerAddress);
    const createProxyData = encodeCreateProxy(safeSingletonAddr, setupData, saltNonce);

    const createTxHash = signAndSendTx(runtime, rpcUrl, deployerPrivateKey, {
        to: proxyFactoryAddr,
        data: createProxyData,
        nonce,
        gasLimit: 5000000n,
        maxFeePerGas: gasPrice,
        maxPriorityFeePerGas: 1000000n,
        chainId,
    });
    const createReceipt = waitForReceipt(runtime, rpcUrl, createTxHash);
    nonce++;

    // Parse ProxyCreation event to get proxy address
    const proxyCreationTopic = "0x" + bytesToHex(keccak_256(utf8ToBytes("ProxyCreation(address,address)")));
    const proxyLog = createReceipt.logs?.find((log: any) =>
        log.topics?.[0]?.toLowerCase() === proxyCreationTopic.toLowerCase()
    );
    if (!proxyLog) throw new Error("ProxyCreation event not found");
    const safeProxyAddr = "0x" + proxyLog.topics[1].slice(-40);

    // 4. Deploy SpectreGuard(teeSigner, safeProxy)
    const guardBytecode = SpectreGuardArtifact.bytecode +
        encodeAddress(teeSignerAddress) + encodeAddress(safeProxyAddr);

    const guardAddr = deployContract(
        runtime, rpcUrl, deployerPrivateKey,
        guardBytecode, nonce, gasPrice, chainId,
    );

    // 5. Compute setGuard calldata
    const setGuardCalldata = encodeSetGuard(guardAddr);

    return {
        safeSingleton: safeSingletonAddr,
        safeProxyFactory: proxyFactoryAddr,
        safeProxy: safeProxyAddr,
        spectreGuard: guardAddr,
        setGuardCalldata,
    };
}

export function executeSetGuard(
    runtime: Runtime<any>,
    params: {
        rpcUrl: string;
        deployerPrivateKey: string;
        safeProxyAddress: string;
        setGuardCalldata: string;
        signature: string;
        maxFeePerGas: bigint;
        chainId: bigint;
    },
): string {
    const { rpcUrl, deployerPrivateKey, safeProxyAddress, setGuardCalldata, signature, maxFeePerGas, chainId } = params;

    const sel = functionSelector(
        "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)"
    );
    const zero = encodeUint256(0);
    const zeroAddr = encodeAddress("0x0000000000000000000000000000000000000000");

    // Adjust v byte +4 for eth_sign compatibility
    const sigBytes = hexToBytes(signature.replace(/^0x/, ""));
    sigBytes[64] += 4;
    const sigHex = bytesToHex(sigBytes);

    const calldataBytes = hexToBytes(setGuardCalldata.replace(/^0x/, ""));
    const calldataHex = bytesToHex(calldataBytes);
    const calldataPadded = calldataHex.padEnd(Math.ceil(calldataHex.length / 64) * 64, "0");

    // Dynamic offsets for bytes params (data at param index 2, signatures at index 9)
    const dataOffset = encodeUint256(10 * 32);
    const sigsOffset = encodeUint256(10 * 32 + 32 + Math.ceil(calldataBytes.length / 32) * 32);

    const execData = "0x" + sel +
        encodeAddress(safeProxyAddress) + zero + dataOffset +
        encodeUint256(0) + zero + zero + zero +
        zeroAddr + zeroAddr + sigsOffset +
        encodeUint256(calldataBytes.length) + calldataPadded +
        encodeUint256(sigBytes.length) + sigHex.padEnd(Math.ceil(sigHex.length / 64) * 64, "0");

    const from = computeAddress(deployerPrivateKey);
    const nonce = ethGetNonce(runtime, rpcUrl, from);

    const txHash = signAndSendTx(runtime, rpcUrl, deployerPrivateKey, {
        to: safeProxyAddress,
        data: execData,
        nonce,
        gasLimit: 5000000n,
        maxFeePerGas,
        maxPriorityFeePerGas: 1000000n,
        chainId,
    });

    return txHash;
}
