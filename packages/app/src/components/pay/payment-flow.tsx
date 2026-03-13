"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Invoice } from "@/lib/types";

type PaymentStep = "idle" | "requesting" | "attested" | "sending" | "complete";

const ATTESTATION_STEPS = [
  { label: "TEE Attestation", desc: "Chainlink CRE validates compliance" },
  { label: "Signature Verified", desc: "EIP-712 bound to transaction" },
  { label: "On-chain Settlement", desc: "Sent through SpectreGuard" },
];

export function PaymentFlow({ invoice }: { invoice: Invoice }) {
  const [step, setStep] = useState<PaymentStep>("idle");

  async function handlePay() {
    setStep("requesting");
    toast.info("Requesting TEE attestation...");

    await new Promise((r) => setTimeout(r, 2000));
    setStep("attested");
    toast.success("TEE attestation verified");

    await new Promise((r) => setTimeout(r, 1000));
    setStep("sending");
    toast.info("Sending payment...");

    await new Promise((r) => setTimeout(r, 2500));
    setStep("complete");
    toast.success("Payment settled on-chain");
  }

  function getStepStatus(index: number): "pending" | "loading" | "done" {
    if (index === 0) {
      if (step === "idle") return "pending";
      if (step === "requesting") return "loading";
      return "done";
    }
    if (index === 1) {
      if (step === "idle" || step === "requesting") return "pending";
      if (step === "attested") return "loading";
      return "done";
    }
    if (step === "complete") return "done";
    if (step === "sending") return "loading";
    return "pending";
  }

  return (
    <div className="max-w-xl">
      {/* Amount hero */}
      <div className="mb-16 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">
          Paying {invoice.id}
        </p>
        <p className="font-mono text-[clamp(3rem,6vw,5rem)] tabular-nums tracking-tight text-sp leading-none">
          {invoice.amount}
          <span className="text-xl text-muted-foreground/40 ml-2">ETH</span>
        </p>
        <p className="font-mono text-xs text-muted-foreground/40 mt-3">
          to {invoice.recipientWorldId}
        </p>
      </div>

      {/* Attestation flow */}
      <div className="mb-10">
        {ATTESTATION_STEPS.map((s, i) => {
          const status = getStepStatus(i);
          return (
            <div
              key={s.label}
              className="flex items-center justify-between border-t border-border py-5"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`size-5 rounded-full flex items-center justify-center ${
                    status === "done"
                      ? "bg-sp/15 text-sp"
                      : status === "loading"
                        ? "bg-sp/15 text-sp"
                        : "text-muted-foreground/20"
                  }`}
                >
                  {status === "done" ? (
                    <Check className="size-3" />
                  ) : status === "loading" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span className="size-1 rounded-full bg-current" />
                  )}
                </div>
                <div>
                  <p
                    className={`font-mono text-xs ${
                      status === "pending" ? "text-muted-foreground/30" : ""
                    }`}
                  >
                    {s.label}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground/25">
                    {s.desc}
                  </p>
                </div>
              </div>
              {status === "done" && (
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-sp">
                  verified
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Action */}
      {step === "complete" ? (
        <div className="text-center py-10 border-t border-border">
          <p className="font-serif text-xl italic text-sp">Payment Complete</p>
          <p className="font-mono text-[11px] text-muted-foreground/40 mt-2">
            Settled on Base Sepolia
          </p>
        </div>
      ) : (
        <button
          onClick={handlePay}
          disabled={step !== "idle"}
          className="w-full py-5 bg-sp text-[#050505] font-mono text-xs uppercase tracking-[0.2em] hover:bg-sp/90 transition-colors duration-300 disabled:opacity-40"
        >
          {step === "idle" ? `Pay ${invoice.amount} ETH` : "Processing..."}
        </button>
      )}
    </div>
  );
}
