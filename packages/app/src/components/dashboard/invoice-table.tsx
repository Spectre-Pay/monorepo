"use client";

import { useState } from "react";
import Link from "next/link";
import { getStatusColor } from "@/lib/mock-data";
import type { Invoice } from "@/lib/types";

const FILTERS = ["all", "pending", "attested", "settled"] as const;

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const [filter, setFilter] = useState<string>("all");

  const filtered = invoices.filter(
    (inv) => filter === "all" || inv.status === filter
  );

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex items-center gap-6 mb-8 border-b border-border pb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[11px] uppercase tracking-[0.15em] transition-colors duration-300 ${
              filter === f
                ? "text-foreground"
                : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Invoice rows */}
      <div>
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="font-serif text-xl italic text-muted-foreground">
              No invoices yet
            </p>
            <Link
              href="/create"
              className="font-mono text-xs text-sp mt-3 inline-block hover:underline"
            >
              Create your first invoice &rarr;
            </Link>
          </div>
        ) : (
          filtered.map((inv) => <InvoiceRow key={inv.id} invoice={inv} />)
        )}
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const statusColor = getStatusColor(invoice.status);

  return (
    <Link
      href={`/invoice/${invoice.id}`}
      className="group flex items-center justify-between border-t border-border py-5 hover:pl-3 transition-all duration-500"
    >
      <div className="flex items-center gap-6 flex-1 min-w-0">
        <span className="font-mono text-sm text-foreground group-hover:text-sp transition-colors duration-500">
          {invoice.id}
        </span>
        <span className="font-mono text-xs text-muted-foreground/50 truncate hidden sm:block">
          {invoice.description}
        </span>
      </div>

      <div className="flex items-center gap-8">
        <span className="font-mono text-sm tabular-nums">
          {invoice.amount}
          <span className="text-muted-foreground/40 ml-1">ETH</span>
        </span>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.15em] w-20 text-right ${statusColor.split(" ")[0]}`}
        >
          {invoice.status}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground/30 w-16 text-right hidden md:block">
          {new Date(invoice.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </Link>
  );
}
