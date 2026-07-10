import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn("px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return (
    <h3
      className={cn(
        "text-sm font-semibold text-[var(--color-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

/** Tarjeta KPI para dashboards */
export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
        {label}
      </p>
      <p
        className="text-2xl font-semibold mt-1.5"
        style={{ color: accent ?? "var(--color-foreground)" }}
      >
        {value}
      </p>
      {hint && <p className="text-xs text-[var(--color-muted)] mt-1">{hint}</p>}
    </Card>
  );
}
