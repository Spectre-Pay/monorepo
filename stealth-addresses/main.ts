import { HTTPCapability, handler, type Runtime, type HTTPPayload, Runner } from "@chainlink/cre-sdk"
import { generateStealthAddresses } from "./controller/StealthGeneration"
import { getNonce, incrementNonce, storeEncryptedAddress, getEncryptedAddress } from "./controller/StorageContract"
import { setStealthAddress as registrySetStealthAddress, getStealthAddress as registryGetStealthAddress } from "./controller/RegistryContract"
import { encrypt, decrypt } from "./controller/Encryption"
import { executeSetGuard, computeAddress, encodeSafeSetup, encodeCreateProxy, encodeSetGuard, padLeft } from "./controller/Safe"
import { SafeArtifact, SafeProxyFactoryArtifact, SpectreGuardArtifact } from "./controller/bytecodes"
import { ethGetNonce } from "./controller/rpc"
import { deployContract, signAndSendTx, waitForReceipt } from "./controller/tx"
import { hexToBytes, bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import { getPublicKey } from "@noble/secp256k1"
import { keccak_256 } from "@noble/hashes/sha3.js"


type Config = {
  storageContractAddress: string
  registryContractAddress: string
  rpcUrl: string
  chainId: number
}

const getTeeKey = (teePrivateKey: string): Uint8Array => {
  if (!teePrivateKey) {
    throw new Error("TEE private key not configured.");
  }
  return hexToBytes(teePrivateKey.replace(/^0x/, ""));
}

// Trigger 0: Generate stealth address and return TEE address
const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const inputStr = new TextDecoder().decode(payload.input);
  const { spendingPublicKey: spendingPubKeyHex, viewingPrivateKey: viewingPrivKeyHex, wnsId } = JSON.parse(inputStr) as {
    spendingPublicKey?: string;
    viewingPrivateKey?: string;
    wnsId?: string;
  };

  if (!spendingPubKeyHex || !viewingPrivKeyHex || !wnsId) {
    throw new Error("Please provide spendingPublicKey and viewingPrivateKey and wnsId.");
  }

  const config = runtime.config;
  const spendingPublicKey = hexToBytes(spendingPubKeyHex.replace(/^0x/, ""));
  const viewingPrivateKey = hexToBytes(viewingPrivKeyHex.replace(/^0x/, ""));

  // Get nonce from on-chain Storage contract
  const nonce = getNonce(runtime, config.storageContractAddress, config.rpcUrl, wnsId, teePrivateKey);
  const addresses = generateStealthAddresses(spendingPublicKey, viewingPrivateKey, nonce);

  // Increment nonce on-chain
  incrementNonce(runtime, config.storageContractAddress, config.rpcUrl, teePrivateKey, wnsId, BigInt(config.chainId));

  // Compute TEE address for Safe deployment
  const teePubKey = getPublicKey(hexToBytes(teePrivateKey.replace(/^0x/, "")), false);
  const teeAddress = "0x" + bytesToHex(keccak_256(teePubKey.slice(1))).slice(-40);

  const result = JSON.stringify({
    stealthAddress: addresses.stealthAddress,
    teeAddress,
    nonce: Number(nonce),
  });
  return new TextEncoder().encode(result);
}

// Trigger 1: Deploy Safe singleton (3 RPC calls: getNonce + sendTx + getReceipt)
const onDeploySingletonTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const config = runtime.config;
  const chainId = BigInt(config.chainId);
  const maxFeePerGas = 10000000n; // 0.01 gwei - sufficient for Base Sepolia

  const from = computeAddress(teePrivateKey);
  const nonce = ethGetNonce(runtime, config.rpcUrl, from);

  const safeSingletonAddr = deployContract(
    runtime, config.rpcUrl, teePrivateKey,
    SafeArtifact.bytecode, nonce, maxFeePerGas, chainId,
  );

  const result = JSON.stringify({ safeSingleton: safeSingletonAddr });
  return new TextEncoder().encode(result);
}

// Trigger 2: Deploy SafeProxyFactory (3 RPC calls: getNonce + sendTx + getReceipt)
const onDeployFactoryTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const config = runtime.config;
  const chainId = BigInt(config.chainId);
  const maxFeePerGas = 10000000n;

  const from = computeAddress(teePrivateKey);
  const nonce = ethGetNonce(runtime, config.rpcUrl, from);

  const proxyFactoryAddr = deployContract(
    runtime, config.rpcUrl, teePrivateKey,
    SafeProxyFactoryArtifact.bytecode, nonce, maxFeePerGas, chainId,
  );

  const result = JSON.stringify({ safeProxyFactory: proxyFactoryAddr });
  return new TextEncoder().encode(result);
}

// Trigger 2: Create Safe proxy + deploy SpectreGuard + store encrypted address (~5 RPC calls)
const onCreateSafeTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const inputStr = new TextDecoder().decode(payload.input);
  const { safeSingleton, safeProxyFactory, stealthAddress, teeAddress, wnsId } = JSON.parse(inputStr) as {
    safeSingleton?: string;
    safeProxyFactory?: string;
    stealthAddress?: string;
    teeAddress?: string;
    wnsId?: string;
  };

  if (!safeSingleton || !safeProxyFactory || !stealthAddress || !teeAddress || !wnsId) {
    throw new Error("Please provide safeSingleton, safeProxyFactory, stealthAddress, teeAddress, and wnsId.");
  }

  const config = runtime.config;
  const chainId = BigInt(config.chainId);
  const maxFeePerGas = 10000000n;

  const from = computeAddress(teePrivateKey);
  const nonce = ethGetNonce(runtime, config.rpcUrl, from);

  // Create Safe proxy with stealth address as owner
  const setupData = encodeSafeSetup(stealthAddress);
  const createProxyData = encodeCreateProxy(safeSingleton, setupData, 0);

  const createTxHash = signAndSendTx(runtime, config.rpcUrl, teePrivateKey, {
    to: safeProxyFactory,
    data: createProxyData,
    nonce,
    gasLimit: 5000000n,
    maxFeePerGas,
    maxPriorityFeePerGas: 1000000n,
    chainId,
  });
  const createReceipt = waitForReceipt(runtime, config.rpcUrl, createTxHash);

  // Parse ProxyCreation event to get proxy address
  const proxyCreationTopic = "0x" + bytesToHex(keccak_256(utf8ToBytes("ProxyCreation(address,address)")));
  const proxyLog = createReceipt.logs?.find((log: any) =>
    log.topics?.[0]?.toLowerCase() === proxyCreationTopic.toLowerCase()
  );
  if (!proxyLog) throw new Error("ProxyCreation event not found");
  const safeProxyAddr = "0x" + proxyLog.topics[1].slice(-40);

  const result = JSON.stringify({
    safeProxy: safeProxyAddr,
    deployerNonce: Number(nonce + 1n),
  });
  return new TextEncoder().encode(result);
}

// Trigger 3: Deploy SpectreGuard + encrypt & store Safe address (~5 RPC calls)
const onDeployGuardTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const inputStr = new TextDecoder().decode(payload.input);
  const { safeProxy, teeAddress, wnsId } = JSON.parse(inputStr) as {
    safeProxy?: string;
    teeAddress?: string;
    wnsId?: string;
  };

  if (!safeProxy || !teeAddress || !wnsId) {
    throw new Error("Please provide safeProxy, teeAddress, and wnsId.");
  }

  const config = runtime.config;
  const chainId = BigInt(config.chainId);
  const maxFeePerGas = 10000000n;

  const from = computeAddress(teePrivateKey);
  const nonce = ethGetNonce(runtime, config.rpcUrl, from);

  // Deploy SpectreGuard(teeSigner, safeProxy)
  const guardBytecode = SpectreGuardArtifact.bytecode +
    padLeft(teeAddress.replace(/^0x/, "").toLowerCase()) +
    padLeft(safeProxy.replace(/^0x/, "").toLowerCase());

  const guardAddr = deployContract(
    runtime, config.rpcUrl, teePrivateKey,
    guardBytecode, nonce, maxFeePerGas, chainId,
  );

  const setGuardCalldata = encodeSetGuard(guardAddr);

  const result = JSON.stringify({
    spectreGuard: guardAddr,
    setGuardCalldata,
    safeProxy,
  });
  return new TextEncoder().encode(result);
}


// Decrypt a stored stealth address using the TEE key
const onDecryptTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const inputStr = new TextDecoder().decode(payload.input);
  const { wnsId } = JSON.parse(inputStr) as { wnsId?: string };

  if (!wnsId) {
    throw new Error("Please provide wnsId.");
  }

  const config = runtime.config;
  const teeKey = getTeeKey(teePrivateKey);

  // Try Registry first, fall back to Storage contract
  let encryptedAddress = registryGetStealthAddress(runtime, config.registryContractAddress, config.rpcUrl, teePrivateKey, wnsId);
  if (!encryptedAddress) {
    encryptedAddress = getEncryptedAddress(runtime, config.storageContractAddress, config.rpcUrl, wnsId, teePrivateKey);
  }
  if (!encryptedAddress) {
    throw new Error("No stored address found for this wnsId.");
  }

  const safeAddress = decrypt(encryptedAddress, teeKey);
  return new TextEncoder().encode(safeAddress);
}

// Trigger 6: Execute setGuard on a deployed Safe using the owner's signature (5 RPC calls)
const onSetGuardTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const inputStr = new TextDecoder().decode(payload.input);
  const { safeProxyAddress, setGuardCalldata, signature, } = JSON.parse(inputStr) as {
    safeProxyAddress?: string;
    setGuardCalldata?: string;
    signature?: string;
  };

  if (!safeProxyAddress || !setGuardCalldata || !signature) {
    throw new Error("Please provide safeProxyAddress, setGuardCalldata, wnsId, and signature.");
  }

  const txHash = executeSetGuard(runtime, {
    rpcUrl: runtime.config.rpcUrl,
    deployerPrivateKey: teePrivateKey,
    safeProxyAddress,
    setGuardCalldata,
    signature,
    maxFeePerGas: 10000000n,
    chainId: BigInt(runtime.config.chainId),
  });
  const result = JSON.stringify({ txHash });
  return new TextEncoder().encode(result);
}

// Trigger 7: Register Safe proxy address in Registry (check first, then set if needed — 1-2 RPC calls)
const onRegisterAddressTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const teePrivateKey = secret.value.replace(/^0x/, "");
  const inputStr = new TextDecoder().decode(payload.input);
  const { safeProxyAddress, wnsId } = JSON.parse(inputStr) as {
    safeProxyAddress?: string;
    wnsId?: string;
  };

  if (!safeProxyAddress || !wnsId) {
    throw new Error("Please provide safeProxyAddress and wnsId.");
  }

  const config = runtime.config;

  // Check if already registered
  // const existing = registryGetStealthAddress(runtime, config.registryContractAddress, config.rpcUrl, teePrivateKey, wnsId);
  // if (existing) {
  //   const result = JSON.stringify({ registered: false, existing, safeProxyAddress });
  //   return new TextEncoder().encode(result);
  // }

  // Not registered — register now
  registrySetStealthAddress(runtime, config.registryContractAddress, config.rpcUrl, teePrivateKey, wnsId, safeProxyAddress, BigInt(config.chainId));

  const result = JSON.stringify({ registered: true, safeProxyAddress });
  return new TextEncoder().encode(result);
}

const initWorkflow = (config: Config) => {
  const httpTrigger = new HTTPCapability()
  const deploySingletonTrigger = new HTTPCapability()
  const deployFactoryTrigger = new HTTPCapability()
  const createSafeTrigger = new HTTPCapability()
  const deployGuardTrigger = new HTTPCapability()
  const decryptTrigger = new HTTPCapability()
  const setGuardTrigger = new HTTPCapability()
  const registerAddressTrigger = new HTTPCapability()

  return [
    handler(
      httpTrigger.trigger({ authorizedKeys: [] }),
      onHttpTrigger                // Trigger 0: Generate stealth address
    ),
    handler(
      deploySingletonTrigger.trigger({ authorizedKeys: [] }),
      onDeploySingletonTrigger     // Trigger 1: Deploy Safe singleton
    ),
    handler(
      deployFactoryTrigger.trigger({ authorizedKeys: [] }),
      onDeployFactoryTrigger       // Trigger 2: Deploy SafeProxyFactory
    ),
    handler(
      createSafeTrigger.trigger({ authorizedKeys: [] }),
      onCreateSafeTrigger          // Trigger 3: Create Safe proxy
    ),
    handler(
      deployGuardTrigger.trigger({ authorizedKeys: [] }),
      onDeployGuardTrigger         // Trigger 4: Deploy SpectreGuard
    ),
    handler(
      decryptTrigger.trigger({ authorizedKeys: [] }),
      onDecryptTrigger             // Trigger 5: Decrypt stored address
    ),
    handler(
      setGuardTrigger.trigger({ authorizedKeys: [] }),
      onSetGuardTrigger            // Trigger 6: Execute setGuard
    ),
    handler(
      registerAddressTrigger.trigger({ authorizedKeys: [] }),
      onRegisterAddressTrigger     // Trigger 7: Register address in Registry
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
