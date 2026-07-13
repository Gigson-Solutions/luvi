"use client";

import { useActionState, useState } from "react";
import { PackagePlus, ArrowDownToLine, ScanLine, X } from "lucide-react";
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

      {sacks.length === 0 ? (
        <EmptyState
          icon={ArrowDownToLine}
          title="No hay sacas en almacén"
          description="Recibe material en Recepciones para poder alimentar la tolva."
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
              <TH className="text-right">Acción</TH>
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
                <TD className="text-right">
                  <form action={action} className="inline-flex">
                    <input type="hidden" name="sackId" value={s.id} />
                    <SubmitButton variant="outline" pendingText="…">
                      <ArrowDownToLine className="w-3.5 h-3.5" /> Entrar a tolva
                    </SubmitButton>
                  </form>
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
  zones,
}: {
  materials: Option[];
  zones: Option[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createOutputSackAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PackagePlus className="w-4 h-4" /> Saca de salida
        </Button>
      </DialogTrigger>
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
              <Input
                id="weight"
                name="weight"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="zoneId">Zona destino (opcional)</Label>
            <Select id="zoneId" name="zoneId" defaultValue="">
              <option value="">Sin ubicar</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.warehouseName} · {z.name}
                </option>
              ))}
            </Select>
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

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Creando saca…">Crear saca</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
