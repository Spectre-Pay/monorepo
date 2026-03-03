
import {
    getPublicKey,
    getSharedSecret,
    Point,
    hashes,
} from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";

// Enable sync hashes for noble/secp256k1
hashes.hmacSha256 = (key: Uint8Array, message: Uint8Array) =>
    hmac(sha256, key, message);
hashes.sha256 = (message: Uint8Array) => sha256(message);

// --- Helpers ---

const ethAddress = (pubKeyUncompressed: Uint8Array): string => {
    const hash = keccak_256(pubKeyUncompressed.slice(1));
    return "0x" + bytesToHex(hash).slice(-40);
}

const generateKeysFromSignature = (sig: Uint8Array): {
    spendingPrivateKey: Uint8Array;
    viewingPrivateKey: Uint8Array;
} => {
    const portion1 = sig.slice(0, 32);
    const portion2 = sig.slice(32, 64);
    return {
        spendingPrivateKey: keccak_256(portion1),
        viewingPrivateKey: keccak_256(portion2),
    };
}

const extractViewingPrivateKeyNode = (
    viewingPrivateKey: Uint8Array,
    nodeNumber: number,
): HDKey => {
    const hdkey = HDKey.fromMasterSeed(viewingPrivateKey);
    return hdkey.derive(`m/5564'/${nodeNumber}'`);
}

const generateEphemeralPrivateKey = (
    viewingKeyNode: HDKey,
    nonce: bigint,
    chainId: number,
): Uint8Array => {
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

const generateStealthAddress = (
    spendingPublicKey: Uint8Array,
    ephemeralPrivateKey: Uint8Array,
): string => {
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

const deriveKeysFromMessage = (signatureHex: string): {
    spendingPublicKey: Uint8Array;
    viewingPrivateKey: Uint8Array;
} => {
    const sig = hexToBytes(signatureHex.replace(/^0x/, ""));
    const { spendingPrivateKey, viewingPrivateKey } =
        generateKeysFromSignature(sig);
    const spendingPublicKey = getPublicKey(spendingPrivateKey, false);

    return { spendingPublicKey, viewingPrivateKey };
}

const generateStealthAddresses = (
    spendingPublicKey: Uint8Array,
    viewingPrivateKey: Uint8Array,
    nonce: bigint,
    chainId = 84532,
): { nonce: bigint; stealthAddress: string } => {
    const viewingKeyNode = extractViewingPrivateKeyNode(viewingPrivateKey, 0);

    const ephPrivKey = generateEphemeralPrivateKey(
        viewingKeyNode,
        nonce + 1n,
        chainId,
    );
    const stealthAddress = generateStealthAddress(spendingPublicKey, ephPrivKey);
    const results: { nonce: bigint; stealthAddress: string } = { nonce, stealthAddress };


    return results;
}

export { deriveKeysFromMessage, generateKeysFromSignature, generateStealthAddresses };