import { cn } from "@/lib/utils";

type Tone =
  "neutral" | "green" | "blue" | "amber" | "purple" | "red" | "sky" | "gray";

const TONES: Record<Tone, string> = {
  neutral: "bg-[var(--color-surface-hover)] text-[var(--color-muted)]",
  green: "bg-green-50 text-green-700 ring-1 ring-green-600/20",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20",
  purple: "bg-purple-50 text-purple-700 ring-1 ring-purple-600/20",
  red: "bg-red-50 text-red-700 ring-1 ring-red-600/20",
  sky: "bg-sky-50 text-sky-700 ring-1 ring-sky-600/20",
  gray: "bg-gray-100 text-gray-600 ring-1 ring-gray-500/20",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

export type { Tone };
