"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value);
  toast.success("Copied");
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-0 mt-16 first:mt-0">
      {label}
    </p>
  );
}

function Row({
  label,
  value,
  copyable,
  accent,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border py-4">
      <span className="font-mono text-xs text-muted-foreground/40">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className={`font-mono text-sm ${accent ? "text-sp" : ""}`}>
          {value}
        </span>
        {copyable && (
          <button
            onClick={() => copyToClipboard(value)}
            className="text-muted-foreground/20 hover:text-sp transition-colors duration-300"
          >
            <Copy className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function SettingsSections() {
  return (
    <div className="max-w-2xl">
      <SectionHeader label="Identity" />
      <Row label="World ID" value="0x5e6f...7a8b" copyable accent />
      <Row label="Status" value="Verified" accent />
      <div className="border-t border-border py-4">
        <span className="font-mono text-[11px] text-muted-foreground/30">
          Identity verified via World Chain. Used for invoice routing and TEE
          attestation binding.
        </span>
      </div>

      <SectionHeader label="Smart Account" />
      <Row
        label="Safe Address"
        value="0x1aA9...8e46"
        copyable
      />
      <Row
        label="Guard Address"
        value="0x8C87...3260"
        copyable
      />
      <Row label="Type" value="Stealth Safe (1/1)" />

      <SectionHeader label="TEE Configuration" />
      <Row label="Signer" value="0x9d0e...1f2a" copyable />
      <Row label="Provider" value="Chainlink CRE" />
      <Row label="Signature" value="EIP-712" />

      <SectionHeader label="Network" />
      <Row label="Network" value="Base Sepolia" accent />
      <Row label="Chain ID" value="84532" />
      <Row label="RPC" value="sepolia.base.org" />
    </div>
  );
}
