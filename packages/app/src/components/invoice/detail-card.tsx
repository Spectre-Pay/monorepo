"use client";

import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { getStatusColor } from "@/lib/mock-data";
import type { Invoice } from "@/lib/types";

function copyToClipboard(value: string, label: string) {
  navigator.clipboard.writeText(value);
  toast.success(`${label} copied`);
}

function Row({
  label,
  value,
  copyable,
  external,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  external?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border py-4 group">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">{value}</span>
        {copyable && (
          <button
            onClick={() => copyToClipboard(value, label)}
            className="text-muted-foreground/30 hover:text-sp transition-colors duration-300"
          >
            <Copy className="size-3" />
          </button>
        )}
        {external && (
          <span className="text-muted-foreground/30">
            <ExternalLink className="size-3" />
          </span>
        )}
      </div>
    </div>
  );
}

export function DetailCard({ invoice }: { invoice: Invoice }) {
  const statusColors = getStatusColor(invoice.status);

  return (
    <div>
      {/* Hero amount */}
      <div className="mb-16 flex items-end justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-2">
            Amount
          </p>
          <p className="font-mono text-[clamp(2.5rem,5vw,4rem)] tabular-nums tracking-tight text-sp leading-none">
            {invoice.amount}
            <span className="text-lg text-muted-foreground/40 ml-2">ETH</span>
          </p>
        </div>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.15em] ${statusColors.split(" ")[0]}`}
        >
          {invoice.status}
        </span>
      </div>

      {/* Details */}
      <div>
        <Row label="Invoice ID" value={invoice.id} />
        <Row label="Invoice Hash" value={invoice.invoiceId} copyable />
        <Row label="Payer" value={invoice.payerWorldId} copyable />
        <Row label="Recipient" value={invoice.recipientWorldId} copyable />
        <Row label="Description" value={invoice.description} />
        <Row
          label="Created"
          value={new Date(invoice.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        />
        {invoice.safeAddress && (
          <Row label="Safe" value={invoice.safeAddress} copyable />
        )}
        {invoice.guardAddress && (
          <Row label="Payment Address" value={invoice.guardAddress} copyable />
        )}
        {invoice.teeSignerAddress && (
          <Row label="TEE Signer" value={invoice.teeSignerAddress} copyable />
        )}
        {invoice.txHash && (
          <Row label="Transaction" value={invoice.txHash} copyable external />
        )}
      </div>
    </div>
  );
}
