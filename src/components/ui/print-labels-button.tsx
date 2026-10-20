"use client";

import { useState } from "react";
import { Printer, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PrintLabelsFeedback {
  ok: boolean;
  status?: string;
  message: string;
}

/**
 * Botón «Imprimir N etiquetas» con el resultado debajo. `print` es la server
 * action (ya ligada a su alta, contenedor…) que manda las etiquetas a la Zebra.
 */
export function PrintLabelsButton({
  print,
  count,
  size = "sm",
}: {
  print: () => Promise<PrintLabelsFeedback>;
  count: number;
  size?: "sm" | "md";
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<PrintLabelsFeedback | null>(null);

  async function onClick(): Promise<void> {
    setPending(true);
    setFeedback(null);
    try {
      setFeedback(await print());
    } catch {
      setFeedback({
        ok: false,
        message: "No se pudieron imprimir las etiquetas. Inténtalo de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={onClick}
        disabled={pending}
      >
        <Printer className="w-3.5 h-3.5" />
        {pending ? "Enviando…" : `Imprimir ${count} etiquetas`}
      </Button>
      {feedback && (
        <p
          className={
            !feedback.ok
              ? "flex items-center gap-1.5 text-xs text-[var(--color-status-rechazo)]"
              : feedback.status === "simulated"
                ? "flex items-center gap-1.5 text-xs text-[var(--color-warning)]"
                : "flex items-center gap-1.5 text-xs text-[var(--color-primary)]"
          }
        >
          {feedback.ok && feedback.status !== "simulated" ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {feedback.message}
        </p>
      )}
    </div>
  );
}
