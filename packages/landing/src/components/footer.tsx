"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

export function Footer() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <footer className="px-6 sm:px-10 pt-40 pb-10">
      <div className="max-w-[1400px] mx-auto">
        {/* Big statement */}
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1.2, ease }}
          className="mb-40"
        >
          <h2 className="font-serif text-[clamp(2rem,6vw,6rem)] leading-[0.9] tracking-[-0.02em] max-w-4xl">
            No payment enters or leaves{" "}
            <span className="italic text-sp">
              without cryptographic proof.
            </span>
          </h2>
        </motion.div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="font-mono text-xs text-muted-foreground">
            spectre<span className="text-muted-foreground/40">_</span>invoices
          </div>
          <div className="flex items-center gap-6 font-mono text-[10px] text-muted-foreground/50 tracking-[0.15em] uppercase">
            <span>Chainlink CRE</span>
            <span>World</span>
            <span>Safe</span>
            <span>Base</span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground/40">
            Convergence 2025
          </div>
        </div>
      </div>
    </footer>
  );
}
