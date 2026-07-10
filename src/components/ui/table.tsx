import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>): React.JSX.Element {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className={cn("w-full text-sm", className)} {...props} />
    </div>
  );
}

export function THead({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return (
    <thead
      className={cn(
        "bg-[var(--color-surface-hover)] text-[var(--color-muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function TBody(
  props: React.HTMLAttributes<HTMLTableSectionElement>,
): React.JSX.Element {
  return <tbody {...props} />;
}

export function TR({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>): React.JSX.Element {
  return (
    <tr
      className={cn(
        "border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-hover)] transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function TH({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return (
    <th
      className={cn(
        "text-left font-medium px-4 py-2.5 whitespace-nowrap text-xs uppercase tracking-wide",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return (
    <td
      className={cn(
        "px-4 py-2.5 text-[var(--color-foreground)] align-middle",
        className,
      )}
      {...props}
    />
  );
}
