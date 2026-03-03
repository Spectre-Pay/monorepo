/**
 * TEE API Server — Express server simulating TEE endpoints.
 * Used by the simulate-flow script for interactive demos.
 * Tests call the TeeSigner class directly for speed.
 */

import express, { Request, Response } from "express";
import { TeeSigner } from "./signer";
import { MockVerifier } from "./verifier";

const PORT = process.env.TEE_PORT ? parseInt(process.env.TEE_PORT) : 3001;

const verifier = new MockVerifier();
const signer = new TeeSigner(process.env.TEE_PRIVATE_KEY, verifier);

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", signer: signer.address });
});

// Get TEE public key
app.get("/pubkey", (_req: Request, res: Response) => {
  res.json({ address: signer.address });
});

// Attest inbound ETH deposit
app.post("/attest/inbound", async (req: Request, res: Response) => {
  try {
    const { guardAddress, chainId, from, value, invoiceId, nonce, deadline } =
      req.body;

    const result = await signer.signInboundAttestation(
      guardAddress,
      chainId,
      {
        from,
        to: guardAddress,
        value: BigInt(value),
        nonce,
        deadline,
        invoiceId,
      }
    );

    res.json(result);
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Attest inbound ERC-20 deposit
app.post("/attest/inbound-token", async (req: Request, res: Response) => {
  try {
    const {
      guardAddress,
      chainId,
      from,
      token,
      amount,
      invoiceId,
      nonce,
      deadline,
    } = req.body;

    const result = await signer.signInboundTokenAttestation(
      guardAddress,
      chainId,
      {
        from,
        to: guardAddress,
        token,
        amount: BigInt(amount),
        nonce,
        deadline,
        invoiceId,
      }
    );

    res.json(result);
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Attest outbound withdrawal
app.post("/attest/outbound", async (req: Request, res: Response) => {
  try {
    const { guardAddress, chainId, safe, to, value, invoiceId, nonce, deadline } =
      req.body;

    const result = await signer.signOutboundAttestation(
      guardAddress,
      chainId,
      {
        safe,
        to,
        value: BigInt(value),
        nonce,
        deadline,
        invoiceId,
      }
    );

    res.json(result);
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

// Attest batch (multiple outbound attestations)
app.post("/attest/batch", async (req: Request, res: Response) => {
  try {
    const { requests, chainId } = req.body;
    const results = [];

    for (const r of requests) {
      const result = await signer.signOutboundAttestation(
        r.guardAddress,
        chainId,
        {
          safe: r.safe,
          to: r.to,
          value: BigInt(r.value),
          nonce: r.nonce,
          deadline: r.deadline,
          invoiceId: r.invoiceId,
        }
      );
      results.push({ ...result, guardAddress: r.guardAddress });
    }

    res.json({ results });
  } catch (err: any) {
    res.status(403).json({ error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TEE Simulator running on port ${PORT}`);
    console.log(`TEE Signer Address: ${signer.address}`);
  });
}

export { app, signer, verifier };
