"use client";

import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import { useState } from "react";
import Image from "next/image";

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
      <motion.div
        animate={{ height: hidden ? 0 : "auto", opacity: hidden ? 0 : 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-sp/5 border-b border-sp/10 overflow-hidden"
      >
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-2 flex items-center justify-center gap-3 font-mono text-[11px] text-sp">
          <span>Coming soon on Aleo</span>
          <span className="text-sp/30">&middot;</span>
          <span className="text-sp/70">Zero-knowledge by default</span>
        </div>
      </motion.div>
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 py-6 flex items-center justify-between mix-blend-difference">
        <a href="/" className="font-mono text-sm text-white tracking-tight">
          spectre<span className="text-white/40">_</span>
        </a>
        <div className="flex items-center gap-4">
          <Image src="/aleo.svg" alt="Aleo" width={54} height={20} className="opacity-40" />
          <span className="font-mono text-[10px] text-white/30 uppercase tracking-[0.15em]">
            Coming Soon
          </span>
        </div>
      </div>
    </motion.header>
  );
}
