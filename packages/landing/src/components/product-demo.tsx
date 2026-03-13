"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const leoCode = `transition create_invoice(
    recipient_id: field,
    amount: u64,
) -> InvoiceRecord {
    return InvoiceRecord {
        owner: self.caller,
        recipient: recipient_id,
        amount: amount,
        status: 0u8,
    };
}`;

export function ProductDemo() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section id="demo" className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-24 flex flex-col sm:flex-row sm:items-end justify-between gap-6"
        >
          <h2 className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Create an
            <br />
            <span className="italic text-sp glow-text">encrypted invoice</span>
          </h2>
          <p className="font-mono text-xs text-muted-foreground max-w-xs leading-relaxed">
            No wallet address exposed. No personal data. Just an Aleo ID and an
            encrypted Leo record.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border">
          {/* UI mockup */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="bg-background p-10 sm:p-14"
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-sp/50 uppercase mb-10">
              Spectre App
            </p>
            <div className="space-y-8">
              <div>
                <p className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-[0.15em] mb-3">
                  Recipient ID
                </p>
                <div className="border-b border-border pb-3">
                  <span className="font-mono text-sm text-sp">
                    aleo1qnr3...spectre
                  </span>
                </div>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-[0.15em] mb-3">
                  Amount
                </p>
                <div className="border-b border-border pb-3 flex items-baseline gap-2">
                  <span className="font-mono text-2xl tabular-nums">500</span>
                  <span className="font-mono text-xs text-muted-foreground/40">
                    ALEO
                  </span>
                </div>
              </div>
              <div className="pt-4">
                <div className="bg-sp text-[#020202] font-mono text-xs uppercase tracking-[0.2em] py-4 text-center">
                  Create Invoice
                </div>
              </div>
            </div>
          </motion.div>

          {/* Leo code */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="bg-background p-10 sm:p-14"
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-cyan/50 uppercase mb-10">
              Leo Program
            </p>
            <pre className="font-mono text-sm text-sp/80 leading-relaxed overflow-x-auto">
              <code>{leoCode}</code>
            </pre>
            <div className="mt-10 border-t border-border pt-6">
              <p className="font-mono text-xs text-muted-foreground/40">
                Invoice minted as a private Leo record.
                <br />
                On-chain. Encrypted. Only visible to parties involved.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
