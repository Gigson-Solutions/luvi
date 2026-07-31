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

/** Tarjeta KPI para dashboards. `icon` opcional → círculo de color a la derecha. */
export function StatCard({
  label,
  value,
  hint,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
  icon?: React.ElementType;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
            {label}
          </p>
          <p
            className="text-2xl font-semibold mt-1.5"
            style={{ color: accent ?? "var(--color-foreground)" }}
          >
            {value}
          </p>
          {hint && (
            <p className="text-xs text-[var(--color-muted)] mt-1">{hint}</p>
          )}
        </div>
        {Icon && (
          <div
            className="shrink-0 rounded-full p-2"
            style={{
              backgroundColor: accent
                ? `color-mix(in srgb, ${accent} 14%, transparent)`
                : "var(--color-surface-hover)",
            }}
          >
            <Icon
              className="w-5 h-5"
              style={{ color: accent ?? "var(--color-muted)" }}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
