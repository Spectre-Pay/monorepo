import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { utf8ToBytes, bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { sign, hashes } from "@noble/secp256k1";

// Configure hash functions required by @noble/secp256k1 v3
hashes.hmacSha256 = (key, message) => hmac(sha256, key, message);
hashes.sha256 = (message) => sha256(message);

// --- ABI encoding helpers (32-byte slots) ---

function encodeUint256(val: bigint): Uint8Array {
    const hex = val.toString(16).padStart(64, "0");
    return hexToBytes(hex);
}

function encodeAddress(addr: string): Uint8Array {
    const clean = addr.replace(/^0x/, "").toLowerCase().padStart(64, "0");
    return hexToBytes(clean);
}

function encodeBytes32(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, "");
    if (clean.length !== 64) throw new Error("bytes32 must be 32 bytes (64 hex chars)");
    return hexToBytes(clean);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
    const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const a of arrays) {
        result.set(a, offset);
        offset += a.length;
    }
    return result;
}

// --- EIP-712 constants ---

const EIP712_DOMAIN_TYPEHASH = keccak_256(
    utf8ToBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
);

const NAME_HASH = keccak_256(utf8ToBytes("SpectreGuard"));
const VERSION_HASH = keccak_256(utf8ToBytes("1"));

const INBOUND_TYPEHASH = keccak_256(
    utf8ToBytes("SpectreInbound(address from,address to,uint256 value,uint256 nonce,uint256 deadline,bytes32 invoiceId)")
);

const OUTBOUND_TYPEHASH = keccak_256(
    utf8ToBytes("SpectreOutbound(address safe,address to,uint256 value,uint256 nonce,uint256 deadline,bytes32 invoiceId)")
);

// --- EIP-712 domain separator ---

function computeDomainSeparator(chainId: number, guardAddress: string): Uint8Array {
    return keccak_256(concat(
        EIP712_DOMAIN_TYPEHASH,
        NAME_HASH,
        VERSION_HASH,
        encodeUint256(BigInt(chainId)),
        encodeAddress(guardAddress),
    ));
}

// --- EIP-712 digest ---

function hashTypedDataV4(domainSeparator: Uint8Array, structHash: Uint8Array): Uint8Array {
    const prefix = new Uint8Array([0x19, 0x01]);
    return keccak_256(concat(prefix, domainSeparator, structHash));
}

// --- Signature helper ---
// @noble/secp256k1 sign() with format:"recovered" returns [recovery(1), r(32), s(32)]
// Solidity ECDSA.recover expects [r(32), s(32), v(1)] where v = recovery + 27

function signDigest(digest: Uint8Array, privKey: Uint8Array): Uint8Array {
    const raw = sign(digest, privKey, {
        prehash: false,
        lowS: true,
        format: "recovered",
    });
    // raw = [recovery(1), r(32), s(32)] — rearrange to [r(32), s(32), v(1)]
    const sig = new Uint8Array(65);
    sig.set(raw.slice(1, 33), 0);   // r
    sig.set(raw.slice(33, 65), 32);  // s
    sig[64] = raw[0] + 27;           // v = recovery + 27
    return sig;
}

// --- Inbound attestation ---

export interface InboundParams {
    from: string;
    guardAddress: string;
    value: bigint;
    nonce: bigint;
    deadline: bigint;
    invoiceId: string; // bytes32 hex (0x-prefixed)
    chainId: number;
}

/**
 * Sign an inbound (deposit) attestation and return packed calldata (161 bytes).
 * Layout: invoiceId(32) | nonce(32) | deadline(32) | signature(65)
 */
export function signInboundAttestation(privKey: Uint8Array, params: InboundParams): Uint8Array {
    const domainSeparator = computeDomainSeparator(params.chainId, params.guardAddress);

    const structHash = keccak_256(concat(
        INBOUND_TYPEHASH,
        encodeAddress(params.from),
        encodeAddress(params.guardAddress), // to = guard address
        encodeUint256(params.value),
        encodeUint256(params.nonce),
        encodeUint256(params.deadline),
        encodeBytes32(params.invoiceId),
    ));

    const digest = hashTypedDataV4(domainSeparator, structHash);
    const sig = signDigest(digest, privKey);

    // Pack: invoiceId(32) | nonce(32) | deadline(32) | sig(65) = 161 bytes
    return concat(
        encodeBytes32(params.invoiceId),
        encodeUint256(params.nonce),
        encodeUint256(params.deadline),
        sig,
    );
}

// --- Outbound attestation ---

export interface OutboundParams {
    safe: string;
    to: string;
    guardAddress: string;
    value: bigint;
    nonce: bigint;
    deadline: bigint;
    invoiceId: string; // bytes32 hex (0x-prefixed)
    chainId: number;
}

/**
 * Sign an outbound (withdrawal) attestation and return packed data (161 bytes).
 * Layout: nonce(32) | deadline(32) | invoiceId(32) | signature(65)
 */
export function signOutboundAttestation(privKey: Uint8Array, params: OutboundParams): Uint8Array {
    const domainSeparator = computeDomainSeparator(params.chainId, params.guardAddress);

    const structHash = keccak_256(concat(
        OUTBOUND_TYPEHASH,
        encodeAddress(params.safe),
        encodeAddress(params.to),
        encodeUint256(params.value),
        encodeUint256(params.nonce),
        encodeUint256(params.deadline),
        encodeBytes32(params.invoiceId),
    ));

    const digest = hashTypedDataV4(domainSeparator, structHash);
    const sig = signDigest(digest, privKey);

    // Pack: nonce(32) | deadline(32) | invoiceId(32) | sig(65) = 161 bytes
    return concat(
        encodeUint256(params.nonce),
        encodeUint256(params.deadline),
        encodeBytes32(params.invoiceId),
        sig,
    );
}
