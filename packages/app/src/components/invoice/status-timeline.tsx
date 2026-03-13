import type { FlowStep } from "@/lib/types";

export function StatusTimeline({ steps }: { steps: FlowStep[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-8">
        Flow
      </p>
      {steps.map((step, i) => (
        <div
          key={step.step}
          className="flex items-baseline justify-between border-t border-border py-4"
        >
          <div className="flex items-baseline gap-4">
            <span
              className={`font-mono text-[10px] ${
                step.completed ? "text-sp" : "text-muted-foreground/20"
              }`}
            >
              {String(step.step).padStart(2, "0")}
            </span>
            <span
              className={`font-serif text-sm italic ${
                step.completed ? "text-foreground" : "text-muted-foreground/30"
              }`}
            >
              {step.label}
            </span>
          </div>
          <div className="text-right">
            {step.timestamp ? (
              <span className="font-mono text-[10px] text-muted-foreground/30">
                {new Date(step.timestamp).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground/15">
                pending
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
