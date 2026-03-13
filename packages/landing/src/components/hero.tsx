"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const terminalLines = [
  "> initializing spectre_invoices.leo...",
  "> connecting to aleo...",
  "> privacy: ON",
  "> compliance: ON",
  "> launching...",
];

export function Hero() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [showMain, setShowMain] = useState(false);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    terminalLines.forEach((_, i) => {
      timers.push(
        setTimeout(() => setVisibleLines(i + 1), 400 + i * 350)
      );
    });
    timers.push(
      setTimeout(() => setShowMain(true), 400 + terminalLines.length * 350 + 600)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <section className="relative min-h-svh flex flex-col justify-end pb-20 sm:pb-28 overflow-hidden">
      {/* Ambient glow — cyan + green */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-sp/[0.03] rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-20 left-1/4 w-[400px] h-[300px] bg-cyan/[0.02] rounded-full blur-[120px] pointer-events-none" />

      {/* Terminal cold open */}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: showMain ? 0 : 1, y: showMain ? -40 : 0 }}
        transition={{ duration: 0.6, ease }}
        className={`absolute inset-0 flex items-center justify-center ${showMain ? "pointer-events-none" : ""}`}
      >
        <div className="font-mono text-sm text-sp/80 space-y-2">
          {terminalLines.map((line, i) => (
            <div
              key={i}
              className={`transition-opacity duration-300 ${
                i < visibleLines ? "opacity-100" : "opacity-0"
              }`}
            >
              {line}
              {i === visibleLines - 1 && (
                <span className="cursor-blink ml-0.5 text-sp">_</span>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      {/* Main hero content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showMain ? 1 : 0 }}
        transition={{ duration: 1.5, ease }}
        className="relative z-10 max-w-[1400px] mx-auto px-6 sm:px-10 w-full"
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={showMain ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 0.2, ease }}
          className="mb-8"
        >
          <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-sp/70">
            Zero-Knowledge Invoices on Aleo
          </span>
        </motion.div>

        <div className="overflow-hidden">
          <motion.h1
            initial={{ y: "100%" }}
            animate={showMain ? { y: 0 } : {}}
            transition={{ duration: 1.2, delay: 0.4, ease }}
            className="font-serif text-[clamp(3rem,8vw,8rem)] leading-[0.9] tracking-[-0.02em]"
          >
            Invoices that
          </motion.h1>
        </div>
        <div className="overflow-hidden">
          <motion.h1
            initial={{ y: "100%" }}
            animate={showMain ? { y: 0 } : {}}
            transition={{ duration: 1.2, delay: 0.5, ease }}
            className="font-serif text-[clamp(3rem,8vw,8rem)] leading-[0.9] tracking-[-0.02em] italic text-sp glow-text"
          >
            can&rsquo;t be seen
          </motion.h1>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={showMain ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, delay: 0.9, ease }}
          className="mt-12 flex flex-col sm:flex-row sm:items-end justify-between gap-8"
        >
          <p className="max-w-md text-muted-foreground leading-relaxed font-mono text-sm">
            Mint invoices as encrypted Leo records.
            <br />
            Compliance verified on-chain with ZK proofs.
            <br />
            Minimal trust surface. No TEE. No custodian.
          </p>
          <span className="font-mono text-xs text-sp/50 uppercase tracking-[0.15em]">
            Coming Soon
          </span>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showMain ? 1 : 0 }}
        transition={{ duration: 1, delay: 1.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-sp/30 to-transparent" />
      </motion.div>
    </section>
  );
}
