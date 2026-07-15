"use client";

import { useActionState, useState } from "react";
import { ArrowRightLeft, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
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
  const [zoneId, setZoneId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await transferSacksAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setSelected(new Set());
        setZoneId("");
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

  const destZone = zones.find((z) => z.id === zoneId);
  const interPlant =
    destZone != null &&
    movableSacks.some(
      (s) =>
        selected.has(s.id) &&
        s.warehouseName != null &&
        s.warehouseName !== destZone.warehouseName,
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
        description="Selecciona las sacas y la zona destino. Si el traslado cruza de planta (La Gineta ↔ Montalbos), se genera un albarán en Holded a nombre de la planta destino."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="zoneId" value={zoneId} />
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
                        name="sackIds"
                        value={s.id}
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
            <SubmitButton pendingText="Trasladando…">Trasladar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
