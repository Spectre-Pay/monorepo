"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const FLOW_PREVIEW = [
  { step: "01", label: "Invoice", desc: "Created and shared" },
  { step: "02", label: "Notify", desc: "TEE notifies recipient" },
  { step: "03", label: "Consent", desc: "Recipient approves" },
  { step: "04", label: "Deploy", desc: "Stealth Safe deployed" },
  { step: "05", label: "Attest", desc: "TEE attestation issued" },
  { step: "06", label: "Settle", desc: "Settled on-chain" },
];

export function InvoiceForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const recipientId = formData.get("recipientId") as string;
    const amount = formData.get("amount") as string;

    if (!recipientId || !amount) {
      toast.error("Please fill in all required fields");
      setLoading(false);
      return;
    }

    setTimeout(() => {
      const newId = `INV-${String(Math.floor(Math.random() * 900) + 100)}`;
      toast.success(`Invoice ${newId} created`, {
        description: `${amount} ETH to ${recipientId.slice(0, 10)}...`,
      });
      setLoading(false);
      router.push("/invoice/INV-001");
    }, 1500);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border">
      {/* Form */}
      <div className="bg-background p-8 sm:p-12">
        <form onSubmit={handleSubmit} className="space-y-10">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 block mb-3">
              Recipient World ID
            </label>
            <input
              name="recipientId"
              placeholder="0x..."
              className="w-full bg-transparent border-b border-border py-3 font-mono text-sm focus:outline-none focus:border-sp transition-colors duration-500 placeholder:text-muted-foreground/20"
            />
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 block mb-3">
              Amount
            </label>
            <div className="flex items-baseline gap-3 border-b border-border">
              <input
                name="amount"
                type="number"
                step="0.001"
                min="0"
                placeholder="0.00"
                className="flex-1 bg-transparent py-3 font-mono text-2xl tabular-nums focus:outline-none placeholder:text-muted-foreground/20"
              />
              <span className="font-mono text-xs text-muted-foreground/40 pb-3">
                ETH
              </span>
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 block mb-3">
              Description
            </label>
            <textarea
              name="description"
              placeholder="What is this payment for?"
              rows={2}
              className="w-full bg-transparent border-b border-border py-3 font-mono text-sm focus:outline-none focus:border-sp transition-colors duration-500 placeholder:text-muted-foreground/20 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-sp text-[#050505] font-mono text-xs uppercase tracking-[0.2em] hover:bg-sp/90 transition-colors duration-300 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Invoice"}
          </button>
        </form>
      </div>

      {/* Flow preview */}
      <div className="bg-background p-8 sm:p-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-10">
          What happens next
        </p>
        <div>
          {FLOW_PREVIEW.map((step) => (
            <div
              key={step.step}
              className="flex items-baseline justify-between border-t border-border py-4"
            >
              <div className="flex items-baseline gap-4">
                <span className="font-mono text-[10px] text-muted-foreground/30">
                  {step.step}
                </span>
                <span className="font-serif text-sm italic">{step.label}</span>
              </div>
              <span className="font-mono text-[11px] text-muted-foreground/40">
                {step.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
