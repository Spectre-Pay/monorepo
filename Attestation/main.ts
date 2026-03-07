import { HTTPCapability, handler, Runner, type Runtime, type HTTPPayload } from "@chainlink/cre-sdk";
import { hexToBytes, bytesToHex } from "@noble/hashes/utils.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { signInboundAttestation, signOutboundAttestation } from "./controller/Attestation";

type Config = {
  guardAddress: string;
  chainId: number;
}

// Trigger 0: Inbound (deposit) attestation
// Payload: { from, value, nonce, deadline, invoiceId }
// invoiceId is a label string — we hash it to bytes32
const onInboundTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const privateKeyHex = secret.value.replace(/^0x/, "");
  const privateKey = hexToBytes(privateKeyHex);

  const config = runtime.config;
  const inputStr = new TextDecoder().decode(payload.input);
  const { from, value, nonce, deadline, invoiceId } = JSON.parse(inputStr) as {
    from?: string;
    value?: string;
    nonce?: number;
    deadline?: number;
    invoiceId?: string;
  };

  if (!from || !value || nonce === undefined || !deadline || !invoiceId) {
    throw new Error("Missing required fields: from, value, nonce, deadline, invoiceId");
  }

  // Hash the invoice label to bytes32
  const invoiceIdBytes32 = "0x" + bytesToHex(keccak_256(utf8ToBytes(invoiceId)));

  return signInboundAttestation(privateKey, {
    from,
    guardAddress: config.guardAddress,
    value: BigInt(value),
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
    invoiceId: invoiceIdBytes32,
    chainId: config.chainId,
  });
}

// Trigger 1: Outbound (withdrawal) attestation
// Payload: { safe, to, value, nonce, deadline, invoiceId }
const onOutboundTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const privateKeyHex = secret.value.replace(/^0x/, "");
  const privateKey = hexToBytes(privateKeyHex);

  const config = runtime.config;
  const inputStr = new TextDecoder().decode(payload.input);
  const { safe, to, value, nonce, deadline, invoiceId } = JSON.parse(inputStr) as {
    safe?: string;
    to?: string;
    value?: string;
    nonce?: number;
    deadline?: number;
    invoiceId?: string;
  };

  if (!safe || !to || !value || nonce === undefined || !deadline || !invoiceId) {
    throw new Error("Missing required fields: safe, to, value, nonce, deadline, invoiceId");
  }

  const invoiceIdBytes32 = "0x" + bytesToHex(keccak_256(utf8ToBytes(invoiceId)));

  return signOutboundAttestation(privateKey, {
    safe,
    to,
    guardAddress: config.guardAddress,
    value: BigInt(value),
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
    invoiceId: invoiceIdBytes32,
    chainId: config.chainId,
  });
}

const initWorkflow = (config: Config) => {
  const inboundTrigger = new HTTPCapability()
  const outboundTrigger = new HTTPCapability()

  return [
    handler(
      inboundTrigger.trigger({ authorizedKeys: [] }),
      onInboundTrigger    // Trigger 0: Inbound attestation
    ),
    handler(
      outboundTrigger.trigger({ authorizedKeys: [] }),
      onOutboundTrigger   // Trigger 1: Outbound attestation
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
