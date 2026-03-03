/**
 * Mock Verifier — simulates sanctions/risk checks that a real TEE would perform
 * via external APIs (e.g., Chainalysis, TRM Labs).
 */

export interface VerificationResult {
  sanctioned: boolean;
  riskScore: number; // 0-100, higher = riskier
  reason?: string;
}

// Default blocklist of sanctioned addresses (lowercase)
const DEFAULT_BLOCKLIST: Set<string> = new Set([
  "0x0000000000000000000000000000000000000bad",
  "0x000000000000000000000000000000000000dead",
]);

// Default risk scores for specific addresses (lowercase)
const DEFAULT_RISK_SCORES: Map<string, number> = new Map([
  ["0x0000000000000000000000000000000000000bad", 100],
  ["0x000000000000000000000000000000000000dead", 100],
]);

const RISK_THRESHOLD = 70;

export class MockVerifier {
  private blocklist: Set<string>;
  private riskScores: Map<string, number>;
  private riskThreshold: number;

  constructor(
    blocklist?: string[],
    riskScores?: Map<string, number>,
    riskThreshold: number = RISK_THRESHOLD
  ) {
    this.blocklist = blocklist
      ? new Set(blocklist.map((a) => a.toLowerCase()))
      : new Set(DEFAULT_BLOCKLIST);
    this.riskScores = riskScores ?? new Map(DEFAULT_RISK_SCORES);
    this.riskThreshold = riskThreshold;
  }

  /**
   * Check an address against sanctions lists and risk scoring.
   */
  checkAddress(address: string): VerificationResult {
    const normalized = address.toLowerCase();

    if (this.blocklist.has(normalized)) {
      return {
        sanctioned: true,
        riskScore: 100,
        reason: "Address is on sanctions list",
      };
    }

    const riskScore = this.riskScores.get(normalized) ?? 0;

    if (riskScore >= this.riskThreshold) {
      return {
        sanctioned: false,
        riskScore,
        reason: `High risk score: ${riskScore}`,
      };
    }

    return { sanctioned: false, riskScore };
  }

  /**
   * Check if a transfer between two addresses should be allowed.
   * Returns true if the transfer is clean, false if it should be blocked.
   */
  checkTransfer(from: string, to: string): {
    allowed: boolean;
    fromResult: VerificationResult;
    toResult: VerificationResult;
  } {
    const fromResult = this.checkAddress(from);
    const toResult = this.checkAddress(to);

    const allowed =
      !fromResult.sanctioned &&
      !toResult.sanctioned &&
      fromResult.riskScore < this.riskThreshold &&
      toResult.riskScore < this.riskThreshold;

    return { allowed, fromResult, toResult };
  }

  /**
   * Add an address to the blocklist at runtime (for testing).
   */
  addToBlocklist(address: string): void {
    this.blocklist.add(address.toLowerCase());
    this.riskScores.set(address.toLowerCase(), 100);
  }

  /**
   * Set a custom risk score for an address (for testing).
   */
  setRiskScore(address: string, score: number): void {
    this.riskScores.set(address.toLowerCase(), score);
  }
}
