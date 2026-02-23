import {
  CronCapability,
  handler,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";

import {
  getPublicKey,
  getSharedSecret,
  sign,
  Point,
  hashes,
  etc,
} from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";

// Enable sync hashes for noble/secp256k1
hashes.hmacSha256 = (key: Uint8Array, message: Uint8Array) =>
  hmac(sha256, key, message);
hashes.sha256 = (message: Uint8Array) => sha256(message);

// --- Stealth address helpers (pure @noble, no viem) ---

function ethAddress(pubKeyUncompressed: Uint8Array): string {
  // skip 0x04 prefix, keccak256, take last 20 bytes
  const hash = keccak_256(pubKeyUncompressed.slice(1));
  return "0x" + bytesToHex(hash).slice(-40);
}

function signMessage(privKey: Uint8Array, message: string): Uint8Array {
  const msgBytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(
    `\x19Ethereum Signed Message:\n${msgBytes.length}`
  );
  const combined = new Uint8Array(prefix.length + msgBytes.length);
  combined.set(prefix);
  combined.set(msgBytes, prefix.length);
  const msgHash = keccak_256(combined);

  // Sign with recovery bit
  const sigBytes = sign(msgHash, privKey, {
    prehash: false,
    lowS: true,
    format: "recovered",
  });

  return sigBytes; // 65 bytes: r(32) + s(32) + v(1)
}

function generateKeysFromSignature(sig: Uint8Array): {
  spendingPrivateKey: Uint8Array;
  viewingPrivateKey: Uint8Array;
} {
  // First 32 bytes -> spending key, next 32 bytes -> viewing key
  const portion1 = sig.slice(0, 32);
  const portion2 = sig.slice(32, 64);
  return {
    spendingPrivateKey: keccak_256(portion1),
    viewingPrivateKey: keccak_256(portion2),
  };
}

function extractViewingPrivateKeyNode(
  viewingPrivateKey: Uint8Array,
  nodeNumber: number
): HDKey {
  const hdkey = HDKey.fromMasterSeed(viewingPrivateKey);
  return hdkey.derive(`m/5564'/${nodeNumber}'`);
}

function generateEphemeralPrivateKey(
  viewingKeyNode: HDKey,
  nonce: bigint,
  chainId: number
): Uint8Array {
  const coinType = (0x80000000 | chainId) >>> 0;
  const coinTypeHex = coinType.toString(16).padStart(8, "0");
  const coinTypePart1 = parseInt(coinTypeHex.slice(0, 1), 16);
  const coinTypePart2 = parseInt(coinTypeHex.slice(1), 16);

  const MAX_NONCE = BigInt(0xfffffff);
  let parentNonce = BigInt(0);
  let childNonce = nonce;
  if (nonce > MAX_NONCE) {
    parentNonce = nonce / (MAX_NONCE + BigInt(1));
    childNonce = nonce % (MAX_NONCE + BigInt(1));
  }

  const path = `m/${coinTypePart1}'/${coinTypePart2}'/0'/${parentNonce}'/${childNonce}'`;
  const child = viewingKeyNode.derive(path);
  if (!child.privateKey) throw new Error("Could not derive ephemeral key");
  return child.privateKey;
}

function generateStealthAddress(
  spendingPublicKey: Uint8Array,
  ephemeralPrivateKey: Uint8Array
): string {
  // ECDH shared secret (uncompressed, 65 bytes)
  const sharedSecret = getSharedSecret(
    ephemeralPrivateKey,
    spendingPublicKey,
    false
  );
  // Hash shared secret (skip 0x04 prefix)
  const hashedSecret = keccak_256(sharedSecret.slice(1));
  const hashBigInt = BigInt("0x" + bytesToHex(hashedSecret));

  // Stealth public key = spendingPubKey * hash (Fluidkey multiplication variant)
  const spendingPoint = Point.fromBytes(spendingPublicKey);
  const stealthPoint = spendingPoint.multiply(hashBigInt);

  // Derive Ethereum address
  const stealthPubUncompressed = stealthPoint.toBytes(false);
  return ethAddress(stealthPubUncompressed);
}

function generateStealthPrivateKey(
  spendingPrivateKey: Uint8Array,
  ephemeralPublicKey: Uint8Array
): string {
  const sharedSecret = getSharedSecret(
    spendingPrivateKey,
    ephemeralPublicKey,
    false
  );
  const hashedSecret = keccak_256(sharedSecret.slice(1));
  const hashBigInt = BigInt("0x" + bytesToHex(hashedSecret));
  const spendBigInt = BigInt("0x" + bytesToHex(spendingPrivateKey));
  const curveN = Point.CURVE().n;
  const stealthKey = etc.mod(spendBigInt * hashBigInt, curveN);
  return "0x" + stealthKey.toString(16).padStart(64, "0");
}

// --- Main stealth address generation ---

function generateaddress(privateKey: Uint8Array): {
  nonce: bigint;
  stealthAddress: string;
  stealthPrivateKey: string;
}[] {
  const viewingPrivateKeyNodeNumber = 0;
  const startNonce = BigInt(0);
  const endNonce = BigInt(10);
  const chainId = 84532;

  const results: {
    nonce: bigint;
    stealthAddress: string;
    stealthPrivateKey: string;
  }[] = [];

  // Derive address from private key
  const pubKeyUncompressed = getPublicKey(privateKey, false);
  const address = ethAddress(pubKeyUncompressed);

  // Generate Fluidkey message and sign it
  const message = `Welcome to Fluidkey! Please sign this message to generate your Fluidkey. This does not cost gas. Pin: 0000 Address: ${address.toLowerCase()}`;
  const sig = signMessage(privateKey, message);

  // Derive spending and viewing keys
  const { spendingPrivateKey, viewingPrivateKey } =
    generateKeysFromSignature(sig);

  // Extract viewing key node
  const viewingKeyNode = extractViewingPrivateKeyNode(
    viewingPrivateKey,
    viewingPrivateKeyNodeNumber
  );

  // Get spending public key (uncompressed)
  const spendingPublicKey = getPublicKey(spendingPrivateKey, false);

  // Generate stealth addresses for each nonce
  for (let nonce = startNonce; nonce <= endNonce; nonce++) {
    const ephPrivKey = generateEphemeralPrivateKey(
      viewingKeyNode,
      nonce,
      chainId
    );

    const ephPubKey = getPublicKey(ephPrivKey, false);

    const stealthAddress = generateStealthAddress(spendingPublicKey, ephPrivKey);

    const stealthPrivateKey = generateStealthPrivateKey(
      spendingPrivateKey,
      ephPubKey
    );

    results.push({ nonce, stealthAddress, stealthPrivateKey });
  }

  return results;
}

// --- CRE Workflow ---

type Config = {
  schedule: string;
};

const onCronTrigger = (runtime: Runtime<Config>): string => {
  runtime.log("Workflow triggered. Generating stealth addresses...");

  // Load private key from CRE secrets
  const secret = runtime.getSecret({ id: "PRIVATE_KEY" }).result();
  const privateKeyHex = secret.value.replace(/^0x/, "");
  const privateKey = hexToBytes(privateKeyHex);

  const stealthAddresses = generateaddress(privateKey);

  stealthAddresses.forEach((entry) => {
    runtime.log(`Nonce: ${entry.nonce}, Address: ${entry.stealthAddress}`);
  });

  return `Generated ${stealthAddresses.length} stealth addresses`;
};

const initWorkflow = (config: Config) => {
  const cron = new CronCapability().trigger({
    schedule: config.schedule,
  });

  return [handler(cron, onCronTrigger)];
};

export async function main() {
  const runner = await Runner.newRunner<Config>();
  await runner.run(initWorkflow);
}
