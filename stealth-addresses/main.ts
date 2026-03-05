import { HTTPCapability, handler, type Runtime, type HTTPPayload, Runner } from "@chainlink/cre-sdk"
import { generateStealthAddresses } from "./controller/StealthGeneration"
import { generateSafe, executeSafeTx } from "./controller/Safe"
import { getNonce, incrementNonce, storeEncryptedAddress, getEncryptedAddress } from "./controller/StorageContract"
import { encrypt, decrypt } from "./controller/Encryption"
import { hexToBytes } from "@noble/hashes/utils.js"


type Config = {
  authorizedEVMAddress: string
  storageContractAddress: string
  teePrivateKey: string
}

const getTeeKey = (config: Config): Uint8Array => {
  if (!config.teePrivateKey) {
    throw new Error("TEE private key not configured.");
  }
  return hexToBytes(config.teePrivateKey.replace(/^0x/, ""));
}

// Callback function that runs when an HTTP request is received
const onHttpTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  const inputStr = new TextDecoder().decode(payload.input);
  const { spendingPublicKey: spendingPubKeyHex, viewingPrivateKey: viewingPrivKeyHex } = JSON.parse(inputStr) as {
    spendingPublicKey?: string;
    viewingPrivateKey?: string;
  };

  if (!spendingPubKeyHex || !viewingPrivKeyHex) {
    throw new Error("Please provide spendingPublicKey and viewingPrivateKey.");
  }

  const config = runtime.config;
  const teeKey = getTeeKey(config);
  const spendingPublicKey = hexToBytes(spendingPubKeyHex.replace(/^0x/, ""));
  const viewingPrivateKey = hexToBytes(viewingPrivKeyHex.replace(/^0x/, ""));

  // Use spendingPubKeyHex as the wnsId
  const wnsId = spendingPubKeyHex;

  // Get nonce from on-chain Storage contract
  const nonce = await getNonce(config.storageContractAddress, wnsId);
  const addresses = generateStealthAddresses(spendingPublicKey, viewingPrivateKey, nonce);

  // Generate Safe for the stealth address
  const stealthAddressBytes = hexToBytes(addresses.stealthAddress.replace(/^0x/, ""));
  const txHash = await generateSafe(stealthAddressBytes);

  // Increment nonce on-chain
  await incrementNonce(config.storageContractAddress, wnsId);

  // Encrypt the stealth safe address with TEE key and store on-chain
  const encryptedAddress = encrypt(addresses.stealthAddress, teeKey);
  await storeEncryptedAddress(config.storageContractAddress, wnsId, encryptedAddress);

  return txHash;
}

// Callback that takes signedTx and executes the pending Safe transaction
const onExecuteTrigger = async (_runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  const inputStr = new TextDecoder().decode(payload.input);
  const { txHash, signedTx } = JSON.parse(inputStr) as { txHash?: string; signedTx?: string };

  if (!txHash || !signedTx) {
    throw new Error("Missing txHash or signedTx in payload.");
  }

  const receiptHash = await executeSafeTx(txHash, signedTx);
  return receiptHash;
}

// Callback that decrypts and returns the stored safe address using the TEE key
const onDecryptTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  const inputStr = new TextDecoder().decode(payload.input);
  const { wnsId } = JSON.parse(inputStr) as { wnsId?: string };

  if (!wnsId) {
    throw new Error("Please provide wnsId.");
  }

  const config = runtime.config;
  const teeKey = getTeeKey(config);

  const encryptedAddress = await getEncryptedAddress(config.storageContractAddress, wnsId);
  if (!encryptedAddress) {
    throw new Error("No stored address found for this wnsId.");
  }

  const safeAddress = decrypt(encryptedAddress, teeKey);
  return safeAddress;
}

const initWorkflow = (config: Config) => {
  const httpTrigger = new HTTPCapability()
  const executeTrigger = new HTTPCapability()
  const decryptTrigger = new HTTPCapability()

  return [
    handler(
      httpTrigger.trigger({
        authorizedKeys: [

        ],
      }),
      onHttpTrigger
    ),
    handler(
      executeTrigger.trigger({
        authorizedKeys: [

        ],
      }),
      onExecuteTrigger
    ),
    handler(
      decryptTrigger.trigger({
        authorizedKeys: [

        ],
      }),
      onDecryptTrigger
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
