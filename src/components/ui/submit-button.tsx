"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./button";

type Variant = React.ComponentProps<typeof Button>["variant"];

export function SubmitButton({
  children,
  pendingText = "Guardando…",
  variant,
  className,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: Variant;
  className?: string;
}): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      className={className}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
