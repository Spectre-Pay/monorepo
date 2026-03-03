"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

export function Architecture() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section id="architecture" className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-24"
        >
          <h2 className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Deployed,
            <br />
            <span className="italic text-muted-foreground">not predicted</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
          <Card
            delay={0}
            label="Predicted Safe"
            labelColor="text-muted-foreground"
            items={[
              "Looks like a normal EOA before deployment",
              "Anyone can send tokens freely",
              "No on-chain logic to enforce checks",
              "Compliance only after deployment",
            ]}
            bad
          />
          <Card
            delay={0.15}
            label="Stealth Safe"
            labelColor="text-sp"
            items={[
              "Guard logic live from moment address is shared",
              "receive() enforces TEE attestation",
              "No unvetted funds can enter",
              "Zero compliance gap",
            ]}
            bad={false}
          />
        </div>
      </div>
    </section>
  );
}

function Card({
  delay,
  label,
  labelColor,
  items,
  bad,
}: {
  delay: number;
  label: string;
  labelColor: string;
  items: string[];
  bad: boolean;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, delay, ease }}
      className="bg-background p-10 sm:p-14"
    >
      <div
        className={`font-mono text-[11px] tracking-[0.2em] uppercase mb-10 ${labelColor}`}
      >
        {label}
      </div>
      <div className="space-y-5">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-4">
            <span
              className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                bad ? "bg-muted-foreground/30" : "bg-sp"
              }`}
            />
            <span className="font-mono text-sm text-muted-foreground leading-relaxed">
              {item}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
