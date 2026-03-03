"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const steps = [
  {
    num: "01",
    title: "Invoice",
    desc: "Payer specifies recipient\u2019s World Chain ID and amount. No wallet address needed.",
  },
  {
    num: "02",
    title: "Notify",
    desc: "Chainlink CRE TEE picks up the request and notifies the recipient securely.",
  },
  {
    num: "03",
    title: "Consent",
    desc: "Recipient reviews and approves. No Safe is created without explicit opt-in.",
  },
  {
    num: "04",
    title: "Deploy",
    desc: "TEE generates a stealth address, deploys a Safe with active compliance guards.",
  },
  {
    num: "05",
    title: "Attest",
    desc: "Payer requests a transaction-specific signature. TEE re-verifies and signs.",
  },
  {
    num: "06",
    title: "Settle",
    desc: "Payment sent with TEE signature. Safe\u2019s receive() validates on-chain.",
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section id="flow" className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-24 flex flex-col sm:flex-row sm:items-end justify-between gap-6"
        >
          <h2 className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Six steps to
            <br />
            <span className="italic text-muted-foreground">settlement</span>
          </h2>
          <p className="font-mono text-xs text-muted-foreground max-w-xs leading-relaxed">
            From invoice creation to on-chain settlement, every step is
            TEE-attested and cryptographically verified.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {steps.map((step, i) => (
            <Step key={step.num} step={step} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({ step, index }: { step: (typeof steps)[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay: index * 0.08, ease }}
      className="group border-t border-border py-10 pr-8"
    >
      <div className="font-mono text-[10px] tracking-[0.3em] text-sp/50 mb-6">
        {step.num}
      </div>
      <h3 className="font-serif text-2xl italic mb-3 group-hover:text-sp transition-colors duration-500">
        {step.title}
      </h3>
      <p className="font-mono text-xs text-muted-foreground leading-relaxed">
        {step.desc}
      </p>
    </motion.div>
  );
}
