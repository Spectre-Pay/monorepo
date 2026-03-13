"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const leoCode = `transition pay_invoice(
    invoice: InvoiceRecord,
    compliance_proof: Proof,
    payment: credits.aleo
) -> Receipt {
    // verify proof, transfer, seal
}`;

const recipientTerminal = [
  "> new record received",
  "> invoice_id: [encrypted]",
  "> amount: [encrypted]",
  "> compliance: VERIFIED \u2713",
  "> status: CLAIMABLE",
];

export function PaymentExecution() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-24"
        >
          <h2 className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Funds move.
            <br />
            <span className="italic text-sp glow-text">Nothing leaks.</span>
          </h2>
        </motion.div>

        {/* Payment + Receipt side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border mb-px">
          {/* Payment execution */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="bg-background p-10 sm:p-14"
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-sp/50 uppercase mb-10">
              Payment
            </p>

            {/* Status progression */}
            <div className="flex items-center gap-3 mb-10">
              {["PENDING", "VERIFIED", "SETTLED"].map((status, i) => (
                <div key={status} className="flex items-center gap-3">
                  {i > 0 && (
                    <span className="font-mono text-[10px] text-sp/30">
                      &rarr;
                    </span>
                  )}
                  <span
                    className={`font-mono text-[11px] uppercase tracking-[0.15em] ${
                      i === 2 ? "text-sp glow-text" : "text-muted-foreground/30"
                    }`}
                  >
                    {status}
                  </span>
                </div>
              ))}
            </div>

            {/* Leo code */}
            <pre className="font-mono text-sm text-sp/70 leading-relaxed mb-8 overflow-x-auto">
              <code>{leoCode}</code>
            </pre>

            <p className="font-mono text-xs text-muted-foreground/40">
              Encrypted capsule through the Aleo network. Every node it
              passes — untouched, unreadable.
            </p>
          </motion.div>

          {/* Recipient side */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="bg-background p-10 sm:p-14"
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-cyan/50 uppercase mb-10">
              Recipient
            </p>

            <div className="space-y-3 mb-10">
              {recipientTerminal.map((line, i) => (
                <motion.div
                  key={line}
                  initial={{ opacity: 0, x: -10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{
                    duration: 0.4,
                    delay: 0.5 + i * 0.1,
                    ease,
                  }}
                  className={`font-mono text-sm ${
                    line.includes("\u2713") || line.includes("CLAIMABLE")
                      ? "text-sp glow-text"
                      : "text-sp/60"
                  }`}
                >
                  {line}
                </motion.div>
              ))}
            </div>

            <div className="border-t border-border pt-6">
              <p className="font-mono text-xs text-muted-foreground/50 mb-4">
                Recipient sees what they need. Nobody else sees anything.
              </p>
              <div className="font-mono text-sm text-sp/60">
                {">"} batch_withdraw: 4 invoices &rarr; 1 proof &rarr; 1 tx
              </div>
              <p className="font-mono text-[11px] text-muted-foreground/30 mt-3">
                Batch. Private. One proof covers everything.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
