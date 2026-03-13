export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-16">
      <h1 className="font-serif text-[clamp(2rem,4vw,3.5rem)] italic leading-[0.95] tracking-[-0.02em]">
        {title}
      </h1>
      {description && (
        <p className="mt-3 font-mono text-xs text-muted-foreground tracking-wide">
          {description}
        </p>
      )}
    </div>
  );
}
