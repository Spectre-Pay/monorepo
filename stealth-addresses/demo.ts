


import {
  getPublicKey,
  getSharedSecret,
  Point,
  hashes,
  etc,
  sign,
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

// --- Helpers ---

function ethAddress(pubKeyUncompressed: Uint8Array): string {
  const hash = keccak_256(pubKeyUncompressed.slice(1));
  return "0x" + bytesToHex(hash).slice(-40);
}

function generateKeysFromSignature(sig: Uint8Array): {
  spendingPrivateKey: Uint8Array;
  viewingPrivateKey: Uint8Array;
} {
  const portion1 = sig.slice(0, 32);
  const portion2 = sig.slice(32, 64);
  return {
    spendingPrivateKey: keccak_256(portion1),
    viewingPrivateKey: keccak_256(portion2),
  };
}

function extractViewingPrivateKeyNode(
  viewingPrivateKey: Uint8Array,
  nodeNumber: number,
): HDKey {
  const hdkey = HDKey.fromMasterSeed(viewingPrivateKey);
  return hdkey.derive(`m/5564'/${nodeNumber}'`);
}

function generateEphemeralPrivateKey(
  viewingKeyNode: HDKey,
  nonce: bigint,
  chainId: number,
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
  ephemeralPrivateKey: Uint8Array,
): string {
  const sharedSecret = getSharedSecret(
    ephemeralPrivateKey,
    spendingPublicKey,
    false,
  );
  const hashedSecret = keccak_256(sharedSecret.slice(1));
  const hashBigInt = BigInt("0x" + bytesToHex(hashedSecret));

  const spendingPoint = Point.fromBytes(spendingPublicKey);
  const stealthPoint = spendingPoint.multiply(hashBigInt);

  const stealthPubUncompressed = stealthPoint.toBytes(false);
  return ethAddress(stealthPubUncompressed);
}

// --- Core: extract keys from message and generate stealth addresses ---

export function deriveKeysFromMessage(signatureHex: string): {
  spendingPublicKey: Uint8Array;
  viewingPrivateKey: Uint8Array;
} {
  const sig = hexToBytes(signatureHex.replace(/^0x/, ""));
  const { spendingPrivateKey, viewingPrivateKey } =
    generateKeysFromSignature(sig);
  const spendingPublicKey = getPublicKey(spendingPrivateKey, false);

  return { spendingPublicKey, viewingPrivateKey };
}

export function generateStealthAddresses(
  spendingPublicKey: Uint8Array,
  viewingPrivateKey: Uint8Array,
  startNonce = BigInt(0),
  endNonce = BigInt(10),
  chainId = 84532,
): { nonce: bigint; stealthAddress: string }[] {
  const viewingKeyNode = extractViewingPrivateKeyNode(viewingPrivateKey, 0);
  const results: { nonce: bigint; stealthAddress: string }[] = [];

  for (let nonce = startNonce; nonce <= endNonce; nonce++) {
    const ephPrivKey = generateEphemeralPrivateKey(
      viewingKeyNode,
      nonce,
      chainId,
    );
    const stealthAddress = generateStealthAddress(spendingPublicKey, ephPrivKey);
    results.push({ nonce, stealthAddress });
  }

  return results;
}


function signMessage(privKey: Uint8Array, message: string): Uint8Array {
  const msgBytes = utf8ToBytes(message);
  const prefix = utf8ToBytes(
    `\x19Ethereum Signed Message:\n${msgBytes.length}`,
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

function generateStealthPrivateKey(
  spendingPrivateKey: Uint8Array,
  ephemeralPublicKey: Uint8Array,
): string {
  const sharedSecret = getSharedSecret(
    spendingPrivateKey,
    ephemeralPublicKey,
    false,
  );
  const hashedSecret = keccak_256(sharedSecret.slice(1));
  const hashBigInt = BigInt("0x" + bytesToHex(hashedSecret));
  const spendBigInt = BigInt("0x" + bytesToHex(spendingPrivateKey));
  const curveN = Point.CURVE().n;
  const stealthKey = etc.mod(spendBigInt * hashBigInt, curveN);
  return "0x" + stealthKey.toString(16).padStart(64, "0");
}

// // Encrypt the stealth address with TEE key and store on-chain
//   const encryptedAddress = encrypt(addresses.stealthAddress, teeKey);
//   await storeEncryptedAddress(config.storageContractAddress, config.rpcUrl, config.teePrivateKey, wnsId, encryptedAddress);

//   // Also store in Registry: map World ID to encrypted stealth address
//   await registrySetStealthAddress(config.registryContractAddress, config.rpcUrl, config.teePrivateKey, wnsId, encryptedAddress);
