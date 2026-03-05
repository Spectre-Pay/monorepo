import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";

/**
 * Symmetric encryption using the TEE private key.
 * Same key encrypts and decrypts — only the TEE holds this key.
 * 1. Derive symmetric key = SHA-256(teePrivateKey)
 * 2. Generate random IV (12B)
 * 3. Encrypt with XOR stream
 * 4. Output: iv (12B) + ciphertext — as hex
 */
export const encrypt = (plaintext: string, teePrivateKey: Uint8Array): string => {
    const symmetricKey = sha256(teePrivateKey);
    const data = new TextEncoder().encode(plaintext);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = xorStream(data, symmetricKey, iv);
    return bytesToHex(iv) + bytesToHex(ciphertext);
};

/**
 * Symmetric decryption using the same TEE private key.
 * 1. Derive symmetric key = SHA-256(teePrivateKey)
 * 2. Extract IV from ciphertext
 * 3. Decrypt with XOR stream
 */
export const decrypt = (cipherHex: string, teePrivateKey: Uint8Array): string => {
    const symmetricKey = sha256(teePrivateKey);
    const raw = hexToBytes(cipherHex);
    const iv = raw.slice(0, 12);
    const ciphertext = raw.slice(12);
    const decrypted = xorStream(ciphertext, symmetricKey, iv);
    return new TextDecoder().decode(decrypted);
};

const xorStream = (data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array => {
    const result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 32) {
        const counter = new Uint8Array(4);
        new DataView(counter.buffer).setUint32(0, i / 32);
        const block = sha256(new Uint8Array([...key, ...iv, ...counter]));
        for (let j = 0; j < 32 && i + j < data.length; j++) {
            result[i + j] = data[i + j] ^ block[j];
        }
    }
    return result;
};
