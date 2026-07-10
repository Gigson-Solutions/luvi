import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-[var(--color-foreground)] mb-1.5",
        className,
      )}
      {...props}
    />
  );
}
