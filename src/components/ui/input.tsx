import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      className={cn(
        "w-full h-9.5 px-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition disabled:opacity-50",
        // Valor inválido (p. ej. fuera del rango de calidad): borde y texto rojos.
        "aria-invalid:border-red-500 aria-invalid:text-red-600",
        className,
      )}
      {...props}
    />
  );
}
