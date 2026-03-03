import { HTTPCapability, handler, Runner, type Runtime, type HTTPPayload } from "@chainlink/cre-sdk";
import { hexToBytes } from "@noble/hashes/utils.js";
import { generateAttestation } from "./controller/Attestation";

type Config = {}

// Callback function that runs when an HTTP request is received
const onHttpTrigger = (runtime: Runtime<Config>, payload: HTTPPayload): Uint8Array => {
  // Load private key from CRE secrets
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const privateKeyHex = secret.value.replace(/^0x/, "");
  const privateKey = hexToBytes(privateKeyHex);
  return generateAttestation(privateKey);
}

const initWorkflow = (config: Config) => {
  const httpTrigger = new HTTPCapability()

  return [
    handler(
      httpTrigger.trigger({
        authorizedKeys: []
      }),
      onHttpTrigger
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}

