"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const terminalLines = [
  { text: "> running compliance check...", delay: 0 },
  { text: "> generating zk_exclusion_proof...", delay: 0.12 },
  { text: "> proving: sender NOT in sanctions list", delay: 0.24 },
  { text: "> proving: recipient NOT in sanctions list", delay: 0.36 },
  { text: "> proof generated \u2713", delay: 0.48, accent: true },
  { text: "> revealing: NOTHING", delay: 0.6, accent: true },
];

export function ZkProof() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section id="proof" className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          ref={ref}
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-24 flex flex-col sm:flex-row sm:items-end justify-between gap-6"
        >
          <h2 className="font-serif text-[clamp(2.5rem,5vw,5rem)] leading-[0.95] tracking-[-0.02em]">
            Compliance proved.
            <br />
            <span className="italic text-sp glow-text">Identity hidden.</span>
          </h2>
          <p className="font-mono text-xs text-muted-foreground max-w-xs leading-relaxed">
            Compliance verified on-chain with ZK proofs. Minimal trust surface.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-border">
          {/* Terminal */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease }}
            className="bg-background p-10 sm:p-14"
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-sp/50 uppercase mb-10">
              ZK Compliance
            </p>
            <div className="space-y-3">
              {terminalLines.map((line) => (
                <motion.div
                  key={line.text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + line.delay, ease }}
                  className={`font-mono text-sm ${
                    line.accent ? "text-sp glow-text" : "text-sp/60"
                  }`}
                >
                  {line.text}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Merkle visualization */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.25, ease }}
            className="bg-background p-10 sm:p-14"
          >
            <p className="font-mono text-[10px] tracking-[0.3em] text-cyan/50 uppercase mb-10">
              Exclusion Proof
            </p>
            {/* Abstract Merkle tree */}
            <div className="flex flex-col items-center gap-4">
              <div className="size-3 rounded-full bg-cyan/40 glow-cyan" />
              <div className="w-px h-6 bg-cyan/20" />
              <div className="flex gap-16">
                <div className="flex flex-col items-center gap-4">
                  <div className="size-2.5 rounded-full bg-muted-foreground/20" />
                  <div className="w-px h-4 bg-border" />
                  <div className="flex gap-6">
                    <div className="size-2 rounded-full bg-muted-foreground/10" />
                    <div className="size-2 rounded-full bg-muted-foreground/10" />
                  </div>
                </div>
                <div className="flex flex-col items-center gap-4">
                  <div className="size-2.5 rounded-full bg-muted-foreground/20" />
                  <div className="w-px h-4 bg-border" />
                  <div className="flex gap-6">
                    <div className="size-2 rounded-full bg-muted-foreground/10" />
                    <div className="size-2 rounded-full bg-muted-foreground/10" />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-10 border-t border-border pt-6 space-y-3">
              <p className="font-mono text-xs text-muted-foreground/50">
                Thousands of sanctioned addresses as Merkle leaves.
              </p>
              <p className="font-mono text-xs text-muted-foreground/50">
                ZK circuit proves exclusion without revealing position or touching
                any node.
              </p>
              <p className="font-mono text-xs text-sp/60">
                Proof attaches to invoice record like a cryptographic seal.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
