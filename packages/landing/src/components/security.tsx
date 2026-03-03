"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const threats = [
  {
    threat: "Sender bypasses compliance",
    counter: "receive() reverts without valid TEE signature",
  },
  {
    threat: "Recipient sends to sanctioned address",
    counter: "Outbound guard requires TEE attestation on destination",
  },
  {
    threat: "Signature replay attack",
    counter: "Nonce-bound, transaction-specific signatures",
  },
  {
    threat: "Compromised World Chain ID",
    counter: "TEE validates ID status on every request",
  },
  {
    threat: "Front-running Safe deployment",
    counter: "Safe deployed inside TEE enclave, address shared post-deploy",
  },
];

export function Security() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section id="security" className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-24 flex flex-col sm:flex-row sm:items-end justify-between gap-6"
        >
          <h2 className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Threat
            <br />
            <span className="italic text-muted-foreground">model</span>
          </h2>
          <p className="font-mono text-xs text-muted-foreground max-w-xs leading-relaxed">
            Every attack vector has a cryptographic countermeasure enforced at
            the smart contract level.
          </p>
        </motion.div>

        <div>
          {threats.map((item, i) => (
            <Row key={item.threat} item={item} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Row({
  item,
  index,
}: {
  item: (typeof threats)[0];
  index: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-5%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : {}}
      transition={{ duration: 0.6, delay: index * 0.06, ease }}
      className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-10 items-baseline border-t border-border py-6"
    >
      <span className="font-mono text-sm">{item.threat}</span>
      <span className="hidden md:block font-mono text-[10px] text-sp/40">
        &rarr;
      </span>
      <span className="font-mono text-sm text-muted-foreground">
        {item.counter}
      </span>
    </motion.div>
  );
}
