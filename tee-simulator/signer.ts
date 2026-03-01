/**
 * TEE Signer — manages the TEE keypair and produces EIP-712 typed attestation signatures.
 *
 * In production this would run inside a Trusted Execution Environment (e.g., Chainlink CRE).
 * For this POC it's a simple TypeScript class backed by an ethers.js Wallet.
 */

import { ethers, TypedDataDomain, TypedDataField } from "ethers";
import { MockVerifier } from "./verifier";

// EIP-712 domain — must match the contract's EIP712 constructor args
const EIP712_DOMAIN: TypedDataDomain = {
  name: "SpectreGuard",
  version: "1",
  // chainId and verifyingContract are set dynamically per guard instance
};

// EIP-712 type definitions
const INBOUND_TYPES: Record<string, TypedDataField[]> = {
  SpectreInbound: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "invoiceId", type: "bytes32" },
  ],
};

const INBOUND_TOKEN_TYPES: Record<string, TypedDataField[]> = {
  SpectreInboundToken: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "invoiceId", type: "bytes32" },
  ],
};

const OUTBOUND_TYPES: Record<string, TypedDataField[]> = {
  SpectreOutbound: [
    { name: "safe", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "invoiceId", type: "bytes32" },
  ],
};

export interface AttestationParams {
  from: string;
  to: string;
  value: bigint;
  nonce: number;
  deadline: number;
  invoiceId: string; // bytes32 hex
}

export interface TokenAttestationParams {
  from: string;
  to: string;
  token: string;
  amount: bigint;
  nonce: number;
  deadline: number;
  invoiceId: string; // bytes32 hex
}

export interface OutboundAttestationParams {
  safe: string;
  to: string;
  value: bigint;
  nonce: number;
  deadline: number;
  invoiceId: string; // bytes32 hex
}

export interface AttestationResult {
  signature: string;
  nonce: number;
  deadline: number;
}

export class TeeSigner {
  private wallet: ethers.Wallet;
  private verifier: MockVerifier;
  private nonceCounter: Map<string, number>; // per-guard nonce tracking

  constructor(privateKey?: string, verifier?: MockVerifier) {
    this.wallet = privateKey
      ? new ethers.Wallet(privateKey)
      : ethers.Wallet.createRandom();
    this.verifier = verifier ?? new MockVerifier();
    this.nonceCounter = new Map();
  }

  /** Returns the TEE signer's Ethereum address */
  get address(): string {
    return this.wallet.address;
  }

  /** Returns the underlying ethers Wallet (for test convenience) */
  get signerWallet(): ethers.Wallet {
    return this.wallet;
  }

  /** Returns the verifier instance (for test configuration) */
  get mockVerifier(): MockVerifier {
    return this.verifier;
  }

  /** Get and increment the nonce for a given guard address */
  private getNextNonce(guardAddress: string): number {
    const current = this.nonceCounter.get(guardAddress.toLowerCase()) ?? 0;
    this.nonceCounter.set(guardAddress.toLowerCase(), current + 1);
    return current;
  }

  /** Build the EIP-712 domain for a specific guard contract */
  private getDomain(
    guardAddress: string,
    chainId: number
  ): TypedDataDomain {
    return {
      ...EIP712_DOMAIN,
      chainId,
      verifyingContract: guardAddress,
    };
  }

  /**
   * Sign an inbound ETH attestation.
   * Checks both sender and recipient against sanctions before signing.
   */
  async signInboundAttestation(
    guardAddress: string,
    chainId: number,
    params: AttestationParams
  ): Promise<AttestationResult> {
    // Run compliance checks
    const check = this.verifier.checkTransfer(params.from, params.to);
    if (!check.allowed) {
      throw new Error(
        `Compliance check failed: from=${check.fromResult.reason ?? "clean"}, to=${check.toResult.reason ?? "clean"}`
      );
    }

    const domain = this.getDomain(guardAddress, chainId);
    const message = {
      from: params.from,
      to: params.to,
      value: params.value,
      nonce: params.nonce,
      deadline: params.deadline,
      invoiceId: params.invoiceId,
    };

    const signature = await this.wallet.signTypedData(
      domain,
      INBOUND_TYPES,
      message
    );

    return {
      signature,
      nonce: params.nonce,
      deadline: params.deadline,
    };
  }

  /**
   * Sign an inbound ERC-20 token attestation.
   */
  async signInboundTokenAttestation(
    guardAddress: string,
    chainId: number,
    params: TokenAttestationParams
  ): Promise<AttestationResult> {
    const check = this.verifier.checkTransfer(params.from, params.to);
    if (!check.allowed) {
      throw new Error(
        `Compliance check failed: from=${check.fromResult.reason ?? "clean"}, to=${check.toResult.reason ?? "clean"}`
      );
    }

    const domain = this.getDomain(guardAddress, chainId);
    const message = {
      from: params.from,
      to: params.to,
      token: params.token,
      amount: params.amount,
      nonce: params.nonce,
      deadline: params.deadline,
      invoiceId: params.invoiceId,
    };

    const signature = await this.wallet.signTypedData(
      domain,
      INBOUND_TOKEN_TYPES,
      message
    );

    return {
      signature,
      nonce: params.nonce,
      deadline: params.deadline,
    };
  }

  /**
   * Sign an outbound attestation (for Safe withdrawals).
   */
  async signOutboundAttestation(
    guardAddress: string,
    chainId: number,
    params: OutboundAttestationParams
  ): Promise<AttestationResult> {
    // Check destination against sanctions
    const check = this.verifier.checkTransfer(params.safe, params.to);
    if (!check.allowed) {
      throw new Error(
        `Compliance check failed: destination=${check.toResult.reason ?? "clean"}`
      );
    }

    const domain = this.getDomain(guardAddress, chainId);
    const message = {
      safe: params.safe,
      to: params.to,
      value: params.value,
      nonce: params.nonce,
      deadline: params.deadline,
      invoiceId: params.invoiceId,
    };

    const signature = await this.wallet.signTypedData(
      domain,
      OUTBOUND_TYPES,
      message
    );

    return {
      signature,
      nonce: params.nonce,
      deadline: params.deadline,
    };
  }

  /**
   * Convenience: auto-assign nonce and compute deadline.
   */
  async attestInbound(
    guardAddress: string,
    chainId: number,
    from: string,
    value: bigint,
    invoiceId: string,
    deadlineOffset: number = 3600 // 1 hour default
  ): Promise<AttestationResult> {
    const nonce = this.getNextNonce(guardAddress);
    const deadline = Math.floor(Date.now() / 1000) + deadlineOffset;

    return this.signInboundAttestation(guardAddress, chainId, {
      from,
      to: guardAddress,
      value,
      nonce,
      deadline,
      invoiceId,
    });
  }

  /**
   * Convenience: auto-assign nonce and compute deadline for token deposits.
   */
  async attestInboundToken(
    guardAddress: string,
    chainId: number,
    from: string,
    token: string,
    amount: bigint,
    invoiceId: string,
    deadlineOffset: number = 3600
  ): Promise<AttestationResult> {
    const nonce = this.getNextNonce(guardAddress);
    const deadline = Math.floor(Date.now() / 1000) + deadlineOffset;

    return this.signInboundTokenAttestation(guardAddress, chainId, {
      from,
      to: guardAddress,
      token,
      amount,
      nonce,
      deadline,
      invoiceId,
    });
  }

  /**
   * Convenience: auto-assign nonce and compute deadline for outbound.
   */
  async attestOutbound(
    guardAddress: string,
    chainId: number,
    safeAddress: string,
    to: string,
    value: bigint,
    invoiceId: string,
    deadlineOffset: number = 3600
  ): Promise<AttestationResult> {
    const nonce = this.getNextNonce(guardAddress);
    const deadline = Math.floor(Date.now() / 1000) + deadlineOffset;

    return this.signOutboundAttestation(guardAddress, chainId, {
      safe: safeAddress,
      to,
      value,
      nonce,
      deadline,
      invoiceId,
    });
  }
}
