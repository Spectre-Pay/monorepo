"use client";

import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";

export function Nav() {
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setHidden(latest > 50);
  });

  return (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1, delay: 0.1 }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      {/* Announcement bar — hides on scroll */}
      <motion.div
        animate={{ height: hidden ? 0 : "auto", opacity: hidden ? 0 : 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-sp/10 border-b border-sp/10 overflow-hidden"
      >
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-2 flex items-center justify-center gap-2 font-mono text-[11px] text-sp">
          <span className="hidden sm:inline">Currently live with ETH on Base Sepolia</span>
          <span className="sm:hidden">ETH live on Base Sepolia</span>
          <span className="text-sp/30">&middot;</span>
          <span className="text-sp/70">ERC-20 coming soon</span>
        </div>
      </motion.div>
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-6 flex items-center justify-between mix-blend-difference">
        <a href="/" className="font-mono text-sm text-white tracking-tight">
          spectre<span className="text-white/40">_</span>
        </a>
        <nav className="hidden md:flex items-center gap-10 font-mono text-xs text-white/60">
          <a href="#flow" className="hover:text-white transition-colors duration-300">Flow</a>
          <a href="#architecture" className="hover:text-white transition-colors duration-300">Architecture</a>
          <a href="#security" className="hover:text-white transition-colors duration-300">Security</a>
        </nav>
        <a
          href="#"
          className="font-mono text-xs text-white/60 hover:text-white transition-colors duration-300"
        >
          Launch &rarr;
        </a>
      </div>
    </motion.header>
  );
}
