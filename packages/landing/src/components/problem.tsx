"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

const problems = [
  {
    highlight: "Everything. Exposed.",
    desc: "Public blockchains broadcast every transaction. Sender, recipient, amount — all visible to anyone.",
  },
  {
    highlight: "Traditional invoicing. Zero privacy.",
    desc: "PDFs with names, bank details, amounts. Forwarded, intercepted, leaked.",
  },
  {
    highlight: "Compliance. Bolted on. After the fact.",
    desc: "Regulatory checks happen after exposure. The damage is already done.",
  },
];

export function Problem() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <section className="py-40 px-6 sm:px-10">
      <div className="max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border" ref={ref}>
          {problems.map((p, i) => (
            <motion.div
              key={p.highlight}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: i * 0.15, ease }}
              className="bg-background p-10 sm:p-14"
            >
              <p className="font-mono text-sp text-lg mb-4 glow-text">
                {p.highlight}
              </p>
              <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                {p.desc}
              </p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.6, ease }}
          className="mt-20 text-center"
        >
          <p className="font-serif text-[clamp(2rem,4vw,4rem)] italic text-sp glow-text">
            There&rsquo;s a better way.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
