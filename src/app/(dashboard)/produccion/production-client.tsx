"use client";

import { useActionState, useState } from "react";
import { PackagePlus, ArrowDownToLine, ScanLine, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { Card } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { SackStatusBadge } from "@/components/ui/status-badge";
import { QrScanner } from "@/components/qr/qr-scanner";
import { QrCode } from "@/components/qr/qr-code";
import { formatKg } from "@/lib/utils";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  enterHopperAction,
  createOutputSackAction,
  findSackByQrAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface Option {
  id: string;
  name: string;
  code: string;
  warehouseName?: string;
}

interface WarehouseSack {
  id: string;
  qrCode: string;
  weight: number;
  status: import("@prisma/client").SackStatus;
  material: { name: string };
  zone: { name: string } | null;
}

// ─── Entrada a tolva ────────────────────────────────────────────────────────────
// `sacks` = sacas que YA están dentro de la tolva (EN_PRODUCCION). El escáner
// resuelve el QR contra almacén por server action (findSackByQrAction), así que
// la tabla es puramente informativa; el flujo "Entrar a tolva" vive en la tarjeta
// del escáner.
export function HopperEntry({
  sacks,
}: {
  sacks: WarehouseSack[];
}): React.JSX.Element {
  const [scanned, setScanned] = useState<WarehouseSack | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await enterHopperAction(prev, formData);
      if (result.ok) setScanned(null);
      return result;
    },
    INITIAL,
  );

  async function handleScan(code: string): Promise<void> {
    setScanError(null);
    const r = await findSackByQrAction(code);
    if (r.ok && r.sack) {
      setScanned({
        id: r.sack.id,
        qrCode: r.sack.qrCode,
        weight: r.sack.weight,
        status: r.sack.status,
        material: { name: r.sack.material.name },
        zone: r.sack.zone ? { name: r.sack.zone.name } : null,
      });
    } else {
      setScanned(null);
      setScanError(r.error ?? "Saca no encontrada");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <ScanLine className="w-4 h-4 text-[var(--color-muted)]" />
          <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
            Escanear saca para entrar a tolva
          </h3>
        </div>
        <QrScanner onScan={handleScan} />
        {scanError && <p className="text-sm text-red-600 mt-3">{scanError}</p>}

        {scanned && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3">
            <div>
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                {scanned.qrCode}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {scanned.material.name} · {formatKg(scanned.weight)}
                {scanned.zone ? ` · ${scanned.zone.name}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <form action={action}>
                <input type="hidden" name="sackId" value={scanned.id} />
                <SubmitButton pendingText="Confirmando…">
                  <ArrowDownToLine className="w-4 h-4" /> Confirmar entrada
                </SubmitButton>
              </form>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setScanned(null)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
        En la tolva
        <span className="ml-2 font-normal text-[var(--color-muted)]">
          {sacks.length}
        </span>
      </h3>

      {sacks.length === 0 ? (
        <EmptyState
          icon={ArrowDownToLine}
          title="No hay sacas en la tolva"
          description="Escanea una saca de almacén para alimentar la tolva."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>QR</TH>
              <TH>Material</TH>
              <TH>Zona</TH>
              <TH>Peso</TH>
              <TH>Estado</TH>
            </TR>
          </THead>
          <TBody>
            {sacks.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.qrCode}</TD>
                <TD>{s.material.name}</TD>
                <TD>{s.zone?.name ?? "—"}</TD>
                <TD>{formatKg(s.weight)}</TD>
                <TD>
                  <SackStatusBadge status={s.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

// ─── Diálogo: crear saca de salida ──────────────────────────────────────────────
const TYPE_LABELS: { value: string; label: string }[] = [
  { value: "PRODUCTO_TERMINADO", label: "Producto Terminado" },
  { value: "SUBPRODUCTO", label: "Subproducto" },
  { value: "RECHAZO", label: "Rechazo" },
];

export function OutputSackDialog({
  materials,
}: {
  materials: Option[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{
    id: string;
    qrCode: string;
    lotNumber: string | null;
  } | null>(null);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createOutputSackAction(prev, formData);
      // Al crear la saca no cerramos: mostramos su QR + lote ("Saca creada").
      if (result.ok && result.created) setCreated(result.created);
      return result;
    },
    INITIAL,
  );

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) setCreated(null);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PackagePlus className="w-4 h-4" /> Saca de salida
        </Button>
      </DialogTrigger>
      {created ? (
        <DialogContent
          title="Saca creada"
          description="Imprime o anota el QR y el nº de lote de la saca de salida."
        >
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <QrCode value={created.qrCode} size={160} />
              <div className="grid grid-cols-2 gap-3 w-full text-sm">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3">
                  <p className="text-xs text-[var(--color-muted)]">
                    ID de saca
                  </p>
                  <p className="font-mono font-medium text-[var(--color-foreground)] break-all">
                    {created.id}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3">
                  <p className="text-xs text-[var(--color-muted)]">Lote</p>
                  <p className="font-mono font-medium text-[var(--color-foreground)]">
                    {created.lotNumber ?? "Suelto"}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreated(null)}
              >
                Crear otra
              </Button>
              <DialogClose asChild>
                <Button type="button">Cerrar</Button>
              </DialogClose>
            </div>
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Registrar saca de salida"
          description="Producto Terminado / Subproducto / Rechazo. El nº de lote se autogenera."
        >
          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor="type">Tipo de salida</Label>
              <Select
                id="type"
                name="type"
                required
                defaultValue="PRODUCTO_TERMINADO"
              >
                {TYPE_LABELS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="materialId">Material</Label>
                <Select
                  id="materialId"
                  name="materialId"
                  required
                  defaultValue=""
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="weight">Peso (kg)</Label>
                <div className="flex gap-2">
                  <Input
                    id="weight"
                    name="weight"
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9.5 w-9.5 shrink-0"
                    title="Leer peso de báscula"
                    aria-label="Leer peso de báscula"
                  >
                    <Scale className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notas</Label>
              <Textarea id="notes" name="notes" />
            </div>

            <p className="text-xs text-[var(--color-muted)]">
              El nº de lote se genera automáticamente (formato DDMMYY-nº). Las
              sacas de Producto Terminado del mismo material se acumulan en el
              lote del día.
            </p>

            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <SubmitButton pendingText="Creando saca…">
                Crear saca
              </SubmitButton>
            </div>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
