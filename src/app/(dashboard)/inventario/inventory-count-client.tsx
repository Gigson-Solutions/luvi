"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
} from "@/components/ui/dialog";
import { QrScanner } from "@/components/qr/qr-scanner";
import { formatDate, formatKg } from "@/lib/utils";
import type {
  OpenCountDetail,
  InventoryCountSummary,
  MissingSack,
  FinishCountResult,
} from "@/lib/services/inventory-count.service";
import {
  startInventoryCountAction,
  scanSackAction,
  finishInventoryCountAction,
  getMissingSacksAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

/** Aviso de la última saca escaneada (correcta, repetida o no esperada). */
interface ScanFeedback {
  tone: "ok" | "warn" | "error";
  text: string;
}

// ─── Sin sesión abierta: iniciar inventario ─────────────────────────────────────

function StartCount({
  warehouses,
}: {
  warehouses: { id: string; name: string }[];
}): React.JSX.Element {
  const [state, action] = useActionState(startInventoryCountAction, INITIAL);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="w-4 h-4 text-[var(--color-muted)]" />
        <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
          Iniciar inventario de sacas
        </h3>
      </div>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ic-warehouse">Almacén</Label>
          <Select
            id="ic-warehouse"
            name="warehouseId"
            defaultValue=""
            className="w-auto min-w-52"
          >
            <option value="">Todos los almacenes</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex-1 min-w-52">
          <Label htmlFor="ic-notes">Notas</Label>
          <Input id="ic-notes" name="notes" placeholder="Opcional" />
        </div>
        <SubmitButton>Empezar</SubmitButton>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        Se compara lo escaneado con las sacas que constan en almacén; al
        finalizar verás cuáles faltan.
      </p>
    </Card>
  );
}

// ─── Sesión abierta: escanear ───────────────────────────────────────────────────

function OpenCount({
  count,
  onFinished,
}: {
  count: OpenCountDetail;
  onFinished: (result: FinishCountResult) => void;
}): React.JSX.Element {
  const router = useRouter();
  const [feedback, setFeedback] = useState<ScanFeedback | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [finishing, setFinishing] = useState(false);

  async function handleScan(code: string): Promise<void> {
    const r = await scanSackAction(count.id, code);
    if (!r.ok || !r.result) {
      setFeedback({ tone: "error", text: r.error ?? "Error al escanear" });
      return;
    }
    const res = r.result;
    if (res.status === "duplicada") {
      setFeedback({
        tone: "warn",
        text: `La saca ${res.qrCode} ya se había escaneado en este inventario.`,
      });
    } else if (res.status === "no_esperada") {
      setFeedback({
        tone: "error",
        text: `${res.qrCode}: ${res.reason}`,
      });
    } else {
      setFeedback({
        tone: "ok",
        text: `${res.qrCode} · ${res.materialName}${
          res.zoneName ? ` · ${res.zoneName}` : ""
        }`,
      });
    }
    router.refresh();
  }

  async function handleFinish(): Promise<void> {
    setFinishing(true);
    try {
      const r = await finishInventoryCountAction(count.id);
      if (r.ok && r.result) {
        // El resultado lo guarda el panel: al cerrar la sesión este componente
        // desaparece y se perdería el listado de sacas que faltan.
        onFinished(r.result);
        router.refresh();
      } else {
        setFeedback({ tone: "error", text: r.error ?? "Error al finalizar" });
      }
    } finally {
      setFinishing(false);
    }
  }

  const pending = Math.max(0, count.expectedCount - count.scannedCount);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="En stock teórico" value={count.expectedCount} />
        <Metric
          label="Escaneadas"
          value={count.scannedCount}
          accent="#15803d"
        />
        <Metric label="Pendientes" value={pending} accent="#d97706" />
        <Metric
          label="No esperadas"
          value={count.unknownCount}
          accent="#dc2626"
        />
      </div>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-[var(--color-muted)]" />
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              Escanear sacas
            </h3>
            <span className="text-xs text-[var(--color-muted)]">
              {count.warehouseName ?? "Todos los almacenes"} · iniciado{" "}
              {formatDate(count.startedAt, true)}
            </span>
          </div>
          <Button
            type="button"
            onClick={handleFinish}
            disabled={finishing}
            variant="outline"
          >
            {finishing ? "Finalizando…" : "Finalizar inventario"}
          </Button>
        </div>

        <QrScanner onScan={handleScan} />

        {/* Alternativa manual: teclear el código si el móvil no lee el QR. */}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manualCode.trim() === "") return;
            void handleScan(manualCode);
            setManualCode("");
          }}
        >
          <Input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Introducir código a mano…"
            aria-label="Código de saca"
          />
          <Button type="submit" variant="outline">
            Añadir
          </Button>
        </form>

        {feedback && (
          <div
            className={
              feedback.tone === "ok"
                ? "mt-3 flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-2 text-sm text-green-800"
                : feedback.tone === "warn"
                  ? "mt-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-800"
                  : "mt-3 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-800"
            }
          >
            {feedback.tone === "ok" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : feedback.tone === "warn" ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            {feedback.text}
          </div>
        )}
      </Card>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
          Escaneadas en esta sesión
          <span className="ml-2 font-normal text-[var(--color-muted)]">
            {count.scans.length}
          </span>
        </h3>
        {count.scans.length === 0 ? (
          <EmptyState
            icon={ScanLine}
            title="Todavía no has escaneado ninguna saca"
            description="Apunta la cámara al QR de la saca o teclea su código."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Hora</TH>
                <TH>QR</TH>
                <TH>Producto</TH>
                <TH>Ubicación</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {count.scans.map((s) => (
                <TR key={s.qrCode}>
                  <TD className="tabular-nums text-[var(--color-muted)]">
                    {new Date(s.scannedAt).toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TD>
                  <TD className="font-mono text-xs">{s.qrCode}</TD>
                  <TD>{s.materialName ?? "—"}</TD>
                  <TD>{s.zoneName ?? "—"}</TD>
                  <TD>
                    {s.unexpected ? (
                      <Badge tone="red">No esperada</Badge>
                    ) : (
                      <Badge tone="green">OK</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p
        className="text-xl font-semibold"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

/** Resultado del recuento recién cerrado, con las sacas que faltaron. */
function CountResult({
  result,
  onClose,
}: {
  result: FinishCountResult;
  onClose: () => void;
}): React.JSX.Element {
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--color-foreground)]">
        Inventario finalizado
      </h3>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="En stock teórico" value={result.expectedCount} />
        <Metric label="Escaneadas" value={result.scannedCount} accent="#15803d" />
        <Metric label="Faltan" value={result.missingCount} accent="#dc2626" />
        <Metric label="No esperadas" value={result.unknownCount} />
      </div>
      {result.missing.length === 0 ? (
        <p className="text-sm text-green-700">
          No falta ninguna saca: el stock cuadra.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-[var(--color-foreground)]">
            Sacas que no se han escaneado:
          </p>
          <Table>
            <THead>
              <TR>
                <TH>QR</TH>
                <TH>Producto</TH>
                <TH>Ubicación</TH>
                <TH className="text-right">Peso</TH>
              </TR>
            </THead>
            <TBody>
              {result.missing.map((m: MissingSack) => (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">{m.qrCode}</TD>
                  <TD>{m.materialName}</TD>
                  <TD>{m.zoneName ?? "—"}</TD>
                  <TD className="text-right">{formatKg(m.weight)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
      <div className="mt-4 flex justify-end">
        <Button type="button" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </Card>
  );
}

/** Abre el listado de sacas que faltaron en un recuento ya cerrado. */
function MissingSacksButton({ countId }: { countId: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState<MissingSack[] | null>(null);

  async function load(): Promise<void> {
    setOpen(true);
    if (missing) return;
    const r = await getMissingSacksAction(countId);
    setMissing(r.missing ?? []);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={load}>
          Ver faltantes
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Sacas que faltaron"
        description="Sacas del stock teórico que no se escanearon en este recuento."
      >
        {missing == null ? (
          <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
        ) : missing.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No hay sacas pendientes que mostrar.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>QR</TH>
                <TH>Producto</TH>
                <TH>Ubicación</TH>
                <TH className="text-right">Peso</TH>
              </TR>
            </THead>
            <TBody>
              {missing.map((m) => (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">{m.qrCode}</TD>
                  <TD>{m.materialName}</TD>
                  <TD>{m.zoneName ?? "—"}</TD>
                  <TD className="text-right">{formatKg(m.weight)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Panel completo (sesión + histórico) ────────────────────────────────────────

export function InventoryCountPanel({
  openCount,
  warehouses,
  history,
}: {
  openCount: OpenCountDetail | null;
  warehouses: { id: string; name: string }[];
  history: InventoryCountSummary[];
}): React.JSX.Element {
  // Resultado del último recuento cerrado en esta pantalla; se mantiene aunque
  // la sesión ya no exista, para poder leer las sacas que faltan.
  const [result, setResult] = useState<FinishCountResult | null>(null);

  return (
    <div className="space-y-6">
      {result ? (
        <CountResult result={result} onClose={() => setResult(null)} />
      ) : openCount ? (
        <OpenCount count={openCount} onFinished={setResult} />
      ) : (
        <StartCount warehouses={warehouses} />
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">
          Inventarios anteriores
        </h3>
        {history.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Todavía no se ha hecho ningún inventario"
            description="Al finalizar una sesión se guarda aquí su fecha y su resultado."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Almacén</TH>
                <TH>Operario</TH>
                <TH className="text-right">Teóricas</TH>
                <TH className="text-right">Escaneadas</TH>
                <TH className="text-right">Faltan</TH>
                <TH>Resultado</TH>
                <TH className="text-right">Detalle</TH>
              </TR>
            </THead>
            <TBody>
              {history.map((c) => (
                <TR key={c.id}>
                  <TD>{formatDate(c.startedAt, true)}</TD>
                  <TD>{c.warehouseName ?? "Todos"}</TD>
                  <TD>{c.userName ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {c.expectedCount ?? "—"}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {c.finishedAt ? (c.scannedCount ?? 0) : c.scans}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {c.missingCount ?? "—"}
                  </TD>
                  <TD>
                    {!c.finishedAt ? (
                      <Badge tone="blue">En curso</Badge>
                    ) : (c.missingCount ?? 0) === 0 ? (
                      <Badge tone="green">Cuadra</Badge>
                    ) : (
                      <Badge tone="red">
                        Faltan {c.missingCount}{" "}
                        {c.missingCount === 1 ? "saca" : "sacas"}
                      </Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    {(c.missingCount ?? 0) > 0 && (
                      <MissingSacksButton countId={c.id} />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
