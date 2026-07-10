import { cn } from "@/lib/utils";

type Variant =
  "primary" | "secondary" | "outline" | "ghost" | "danger" | "warning";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] focus-visible:ring-[var(--color-primary)]",
  secondary:
    "bg-[var(--color-surface-hover)] text-[var(--color-foreground)] hover:bg-[var(--color-border)] focus-visible:ring-[var(--color-muted)]",
  outline:
    "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] focus-visible:ring-[var(--color-primary)]",
  ghost:
    "text-[var(--color-foreground)] hover:bg-[var(--color-surface-hover)] focus-visible:ring-[var(--color-muted)]",
  danger:
    "bg-[var(--color-status-rechazo)] text-white hover:brightness-95 focus-visible:ring-[var(--color-status-rechazo)]",
  warning:
    "bg-[var(--color-warning)] text-[var(--color-warning-foreground)] hover:bg-[var(--color-warning-hover)] focus-visible:ring-[var(--color-warning)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9.5 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
  icon: "h-9 w-9 p-0",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
