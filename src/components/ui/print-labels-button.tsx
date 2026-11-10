"use client";

import { useState } from "react";
import { Printer, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getPrinterChoiceAction } from "@/lib/actions/printers";
import type { PrinterOption } from "@/lib/services/printer.service";

export interface PrintLabelsFeedback {
  ok: boolean;
  status?: string;
  message: string;
}

/**
 * Botón «Imprimir» con el resultado debajo. `print` es la server action (ya
 * ligada a su alta, contenedor, saca…) que manda las etiquetas a la Zebra en
 * la impresora `printerId` (null = la de respaldo).
 *
 * Con más de una impresora dada de alta, al pulsar se pregunta en cuál
 * imprimir, con la última que usó el usuario ya marcada. Con una o ninguna,
 * imprime directamente.
 */
export function PrintLabelsButton({
  print,
  count,
  label,
  variant = "outline",
  size = "sm",
}: {
  print: (printerId: string | null) => Promise<PrintLabelsFeedback>;
  count?: number;
  label?: string;
  variant?: "primary" | "outline";
  size?: "sm" | "md";
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<PrintLabelsFeedback | null>(null);
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const buttonLabel = label ?? `Imprimir ${count ?? 0} etiquetas`;

  async function send(printerId: string | null): Promise<void> {
    setChoosing(false);
    setPending(true);
    setFeedback(null);
    try {
      setFeedback(await print(printerId));
    } catch {
      setFeedback({
        ok: false,
        message: "No se pudieron imprimir las etiquetas. Inténtalo de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  async function onClick(): Promise<void> {
    setPending(true);
    setFeedback(null);
    let choice: Awaited<ReturnType<typeof getPrinterChoiceAction>>;
    try {
      choice = await getPrinterChoiceAction();
    } catch {
      setPending(false);
      setFeedback({
        ok: false,
        message:
          "No se pudo cargar la lista de impresoras. Inténtalo de nuevo.",
      });
      return;
    }
    if (choice.printers.length <= 1) {
      await send(choice.selectedId);
      return;
    }
    setPending(false);
    setPrinters(choice.printers);
    setSelectedId(choice.selectedId);
    setChoosing(true);
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={onClick}
        disabled={pending}
      >
        <Printer className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
        {pending ? "Enviando…" : buttonLabel}
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

      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent
          title="¿En qué impresora?"
          description={
            count ? `${count} etiqueta${count === 1 ? "" : "s"}` : undefined
          }
          className="max-w-sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(selectedId);
            }}
            className="space-y-4"
          >
            <div className="space-y-2" role="radiogroup">
              {printers.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors",
                    p.id === selectedId
                      ? "border-[var(--color-primary)] bg-[var(--color-surface-hover)]"
                      : "border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]",
                  )}
                >
                  <input
                    type="radio"
                    name="printer"
                    value={p.id}
                    checked={p.id === selectedId}
                    onChange={() => setSelectedId(p.id)}
                    className="accent-[var(--color-primary)]"
                  />
                  <Printer className="w-4 h-4 text-[var(--color-muted)]" />
                  <span className="font-medium text-[var(--color-foreground)]">
                    {p.name}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setChoosing(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!selectedId}>
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
