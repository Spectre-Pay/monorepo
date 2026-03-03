"use client";

import { motion } from "framer-motion";

const ease = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative min-h-svh flex flex-col justify-end pb-20 sm:pb-28 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-sp/[0.04] rounded-full blur-[160px] pointer-events-none" />

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 sm:px-10 w-full">
        {/* Kicker */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3, ease }}
          className="mb-8"
        >
          <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-sp/70">
            Convergence Hackathon &mdash; Chainlink &middot; World &middot; Safe
          </span>
        </motion.div>

        {/* Headline */}
        <div className="overflow-hidden">
          <motion.h1
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 1.2, delay: 0.5, ease }}
            className="font-serif text-[clamp(3rem,8vw,8rem)] leading-[0.9] tracking-[-0.02em]"
          >
            Invoices that
          </motion.h1>
        </div>
        <div className="overflow-hidden">
          <motion.h1
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 1.2, delay: 0.6, ease }}
            className="font-serif text-[clamp(3rem,8vw,8rem)] leading-[0.9] tracking-[-0.02em] italic text-sp"
          >
            can&rsquo;t be compromised
          </motion.h1>
        </div>

        {/* Subline + CTA row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1, ease }}
          className="mt-12 flex flex-col sm:flex-row sm:items-end justify-between gap-8"
        >
          <p className="max-w-md text-muted-foreground leading-relaxed font-mono text-sm">
            Generate invoices with a World Chain ID.
            <br />
            Every payment flows through TEE-attested
            <br />
            Stealth Safes. Compliance at the infrastructure layer.
          </p>
          <a
            href="#"
            className="group inline-flex items-center gap-3 font-mono text-sm border-b border-foreground/20 pb-1 hover:border-sp hover:text-sp transition-colors duration-500"
          >
            Launch App
            <span className="inline-block group-hover:translate-x-1 transition-transform duration-300">
              &rarr;
            </span>
          </a>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-muted-foreground/30 to-transparent" />
      </motion.div>
    </section>
  );
}
