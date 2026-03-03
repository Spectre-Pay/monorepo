import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";
import { sign, hashes } from "@noble/secp256k1";

// Configure hash functions required by @noble/secp256k1 v3
hashes.hmacSha256 = (key, message) => hmac(sha256, key, message);
hashes.sha256 = (message) => sha256(message);

const generateAttestation = (privKey: Uint8Array): Uint8Array => {
    const message: string = "Giving Attestation to this Account";
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

export { generateAttestation };