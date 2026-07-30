"use client";

import { useActionState, useState } from "react";
import {
  ArrowRightLeft,
  PackageCheck,
  ListChecks,
  ScanLine,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { QrScanner } from "@/components/qr/qr-scanner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { formatKg } from "@/lib/utils";
import {
  moveSackAction,
  transferSacksAction,
  findWarehouseSackByQrAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface ZoneOption {
  id: string;
  name: string;
  code: string;
  warehouseName: string;
}

export interface MovableSack {
  id: string;
  qrCode: string;
  materialName: string;
  weight: number;
  zoneId: string | null;
  warehouseName: string | null;
}

// ─── Diálogo: trasladar saca entre zonas ────────────────────────────────────
export function MoveSackDialog({
  sackId,
  qrCode,
  currentZoneId,
  zones,
  size = "sm",
  variant = "outline",
}: {
  sackId: string;
  qrCode: string;
  currentZoneId: string | null;
  zones: ZoneOption[];
  size?: "sm" | "md";
  variant?: "outline" | "primary" | "secondary";
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await moveSackAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  const targets = zones.filter((z) => z.id !== currentZoneId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant}>
          <ArrowRightLeft className="w-3.5 h-3.5" /> Trasladar
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Trasladar saca · ${qrCode}`}
        description="Mueve la saca a otra zona. Se valida la capacidad de la zona destino."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="sackId" value={sackId} />
          <div>
            <Label htmlFor="zoneId">Zona destino</Label>
            <Select id="zoneId" name="zoneId" required defaultValue="">
              <option value="" disabled>
                Selecciona…
              </option>
              {targets.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.warehouseName} · {z.name}
                </option>
              ))}
            </Select>
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Trasladando…">
              Confirmar traslado
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: trasladar varias sacas (+ albarán si es entre plantas) ─────────
export function TransferSacksDialog({
  movableSacks,
  zones,
}: {
  movableSacks: MovableSack[];
  zones: ZoneOption[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"select" | "scan">("select");
  const [zoneId, setZoneId] = useState("");
  // Modo manual: ids seleccionados de la lista de sacas en almacén.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Modo escáner: sacas acumuladas al pistolear (id → datos de la saca).
  const [scanned, setScanned] = useState<Map<string, MovableSack>>(new Map());
  const [scanError, setScanError] = useState<string | null>(null);

  function reset(): void {
    setMode("select");
    setSelected(new Set());
    setScanned(new Map());
    setZoneId("");
    setScanError(null);
  }

  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await transferSacksAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        reset();
      }
      return result;
    },
    INITIAL,
  );

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleScan(code: string): Promise<void> {
    setScanError(null);
    const r = await findWarehouseSackByQrAction(code);
    if (!r.ok || !r.sack) {
      setScanError(r.error ?? "Saca no encontrada");
      return;
    }
    const sack = r.sack;
    setScanned((prev) => {
      if (prev.has(sack.id)) return prev; // evita duplicados
      const next = new Map(prev);
      next.set(sack.id, sack);
      return next;
    });
  }

  function removeScanned(id: string): void {
    setScanned((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  // Sacas efectivas a trasladar según el modo activo.
  const selectedSacks: MovableSack[] =
    mode === "select"
      ? movableSacks.filter((s) => selected.has(s.id))
      : Array.from(scanned.values());

  const destZone = zones.find((z) => z.id === zoneId);
  const interPlant =
    destZone != null &&
    selectedSacks.some(
      (s) =>
        s.warehouseName != null && s.warehouseName !== destZone.warehouseName,
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <PackageCheck className="w-3.5 h-3.5" /> Trasladar varias
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Trasladar varias sacas"
        description="Selecciona o pistolea (escanea QR) las sacas y elige la zona destino. Si el traslado cruza de planta (La Gineta ↔ Montalbos), se genera un albarán en Holded a nombre de la planta destino."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="zoneId" value={zoneId} />
          {selectedSacks.map((s) => (
            <input key={s.id} type="hidden" name="sackIds" value={s.id} />
          ))}

          <div>
            <Label htmlFor="transfer-zone">Zona destino</Label>
            <Select
              id="transfer-zone"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              required
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.warehouseName} · {z.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Selector de modo: seleccionar manualmente o pistolear QR */}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "select" ? "primary" : "outline"}
              onClick={() => setMode("select")}
            >
              <ListChecks className="w-4 h-4" /> Seleccionar
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "scan" ? "primary" : "outline"}
              onClick={() => setMode("scan")}
            >
              <ScanLine className="w-4 h-4" /> Escanear
            </Button>
          </div>

          {mode === "select" ? (
            <div>
              <Label>Sacas ({selected.size} seleccionadas)</Label>
              <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {movableSacks.length === 0 ? (
                  <p className="p-3 text-sm text-[var(--color-muted)]">
                    No hay sacas en almacén para trasladar.
                  </p>
                ) : (
                  movableSacks.map((s) => {
                    const atDest = destZone != null && s.zoneId === destZone.id;
                    return (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 p-2.5 text-sm cursor-pointer hover:bg-[var(--color-surface-hover)]"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggle(s.id)}
                          disabled={atDest}
                        />
                        <span className="font-medium text-[var(--color-foreground)]">
                          {s.qrCode}
                        </span>
                        <span className="text-[var(--color-muted)]">
                          {s.materialName} · {formatKg(s.weight)}
                        </span>
                        {s.warehouseName && (
                          <span className="ml-auto text-xs text-[var(--color-muted)]">
                            {s.warehouseName}
                          </span>
                        )}
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <QrScanner onScan={handleScan} />
              {scanError && <p className="text-sm text-red-600">{scanError}</p>}

              <div>
                <Label>{scanned.size} sacas a trasladar</Label>
                <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                  {scanned.size === 0 ? (
                    <p className="p-3 text-sm text-[var(--color-muted)]">
                      Escanea el QR de una saca en almacén para añadirla.
                    </p>
                  ) : (
                    Array.from(scanned.values()).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 p-2.5 text-sm"
                      >
                        <span className="font-medium text-[var(--color-foreground)]">
                          {s.qrCode}
                        </span>
                        <span className="text-[var(--color-muted)]">
                          {s.materialName} · {formatKg(s.weight)}
                        </span>
                        {s.warehouseName && (
                          <span className="text-xs text-[var(--color-muted)]">
                            {s.warehouseName}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="ml-auto"
                          onClick={() => removeScanned(s.id)}
                          aria-label={`Quitar ${s.qrCode}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {interPlant && (
            <p className="text-xs text-[var(--color-primary)] flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 shrink-0" />
              Traslado entre plantas: se generará un albarán en Holded.
            </p>
          )}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Trasladando…">
              Trasladar {selectedSacks.length} saca(s)
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
