import { HTTPCapability, handler, type Runtime, type HTTPPayload, Runner } from "@chainlink/cre-sdk"
import { deriveKeysFromMessage, generateStealthAddresses } from "./controller/StealthGeneration"
import { generateSafe, executeSafeTx } from "./controller/Safe"
import { hexToBytes } from "@noble/hashes/utils.js"


type Config = {
  authorizedEVMAddress: string
}

interface UserStealthDetails {
  lastUsedNonce: bigint;
  spendingPublicKey: Uint8Array;
  viewingPrivateKey: Uint8Array;
}

// address → stealth details
const userDetails = new Map<string, UserStealthDetails>();

// Callback function that runs when an HTTP request is received
const onHttpTrigger = async (runtime: Runtime<Config>, payload: HTTPPayload): Promise<string> => {
  const senderKey = payload.key?.publicKey ?? "";
  const inputStr = new TextDecoder().decode(payload.input);
  const { signMessage } = JSON.parse(inputStr) as { signMessage?: string };

  let details = userDetails.get(senderKey);

  if (!details) {
    if (!signMessage) {
      throw new Error("User details do not exist. Please provide the sign message to create.");
    }
    const { spendingPublicKey, viewingPrivateKey } = deriveKeysFromMessage(signMessage);
    details = { lastUsedNonce: 0n, spendingPublicKey, viewingPrivateKey };
    userDetails.set(senderKey, details);
  }

  const nonce = details.lastUsedNonce;
  const addresses = generateStealthAddresses(details.spendingPublicKey, details.viewingPrivateKey, nonce);

  details.lastUsedNonce = addresses.nonce + 1n;
  userDetails.set(senderKey, details);

  const stealthAddressBytes = hexToBytes(addresses.stealthAddress.replace(/^0x/, ""));
  const txHash = await generateSafe(stealthAddressBytes);

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

const initWorkflow = (config: Config) => {
  const httpTrigger = new HTTPCapability()
  const executeTrigger = new HTTPCapability()

  return [
    handler(
      httpTrigger.trigger({
        authorizedKeys: [
          {
            type: "KEY_TYPE_ECDSA_EVM",
            publicKey: config.authorizedEVMAddress,
          },
        ],
      }),
      onHttpTrigger
    ),
    handler(
      executeTrigger.trigger({
        authorizedKeys: [
          {
            type: "KEY_TYPE_ECDSA_EVM",
            publicKey: config.authorizedEVMAddress,
          },
        ],
      }),
      onExecuteTrigger
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
