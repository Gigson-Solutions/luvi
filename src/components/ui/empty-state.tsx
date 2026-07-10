import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6 rounded-xl border border-dashed border-[var(--color-border)]",
        className,
      )}
    >
      {Icon && (
        <div className="w-11 h-11 rounded-full bg-[var(--color-surface-hover)] flex items-center justify-center mb-3">
          <Icon className="w-5 h-5 text-[var(--color-muted)]" />
        </div>
      )}
      <p className="text-sm font-medium text-[var(--color-foreground)]">
        {title}
      </p>
      {description && (
        <p className="text-sm text-[var(--color-muted)] mt-1 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
