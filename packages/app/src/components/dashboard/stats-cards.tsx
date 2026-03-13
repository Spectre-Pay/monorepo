import type { DashboardStats } from "@/lib/types";

export function StatsCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border mb-16">
      <StatBlock label="Invoices" value={stats.totalInvoices.toString()} />
      <StatBlock label="Volume" value={stats.totalVolume} suffix="ETH" accent />
      <StatBlock label="Pending" value={stats.pendingCount.toString()} />
      <StatBlock label="Settled" value={stats.settledCount.toString()} accent />
    </div>
  );
}

function StatBlock({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-background p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-3">
        {label}
      </p>
      <p className={`font-mono text-3xl tabular-nums tracking-tight ${accent ? "text-sp" : ""}`}>
        {value}
        {suffix && (
          <span className="text-sm text-muted-foreground ml-1">{suffix}</span>
        )}
      </p>
    </div>
  );
}
