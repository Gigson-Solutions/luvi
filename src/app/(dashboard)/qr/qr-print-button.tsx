"use client";

import { useState } from "react";
import { Printer, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Botón de reimpresión de etiqueta de saca.
 *
 * Llama al endpoint existente `POST /api/qr-print`, que genera el ZPL de la
 * etiqueta A5 y lo encola. Si no hay impresora configurada el ZPL se genera
 * igual (`status: "simulated"`) — la impresión nunca bloquea la operativa.
 * El resultado se muestra como estado inline (sin librería de toasts).
 */

/** Campos que el endpoint `POST /api/qr-print` espera (interface PrintJob). */
export interface QrPrintJob {
  sackId: string;
  qrCode: string;
  weight: number;
  material: string;
  warehouse: string;
  batchNumber?: string;
  codigoProducto?: string;
  tipoProducto?: string;
  contenedor?: string;
  bl?: string;
  fecha?: string;
}

type Feedback =
  | { kind: "idle" }
  | { kind: "queued"; message: string }
  | { kind: "simulated"; message: string }
  | { kind: "error"; message: string };

export function QrPrintButton({ job }: { job: QrPrintJob }): React.JSX.Element {
  const [feedback, setFeedback] = useState<Feedback>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  async function print(): Promise<void> {
    setPending(true);
    setFeedback({ kind: "idle" });
    try {
      const res = await fetch("/api/qr-print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { status: string; message: string };
      setFeedback(
        data.status === "simulated"
          ? {
              kind: "simulated",
              message:
                "Impresora no configurada — etiqueta generada, sin impresión física.",
            }
          : {
              kind: "queued",
              message: "Etiqueta enviada a la cola de impresión.",
            },
      );
    } catch {
      setFeedback({
        kind: "error",
        message: "No se pudo imprimir la etiqueta. Inténtalo de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={print} disabled={pending}>
        <Printer className="w-4 h-4" />
        {pending ? "Enviando…" : "Imprimir etiqueta"}
      </Button>

      {feedback.kind === "queued" && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-primary)]">
          <Check className="w-3.5 h-3.5" /> {feedback.message}
        </p>
      )}
      {feedback.kind === "simulated" && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-warning)]">
          <AlertTriangle className="w-3.5 h-3.5" /> {feedback.message}
        </p>
      )}
      {feedback.kind === "error" && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-status-rechazo)]">
          <AlertTriangle className="w-3.5 h-3.5" /> {feedback.message}
        </p>
      )}
    </div>
  );
}
