"use client";

import { useActionState, useEffect, useState } from "react";
import { ArrowRightLeft } from "lucide-react";
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
import { moveSackAction, type ActionState } from "./actions";

const INITIAL: ActionState = { ok: false };

interface ZoneOption {
  id: string;
  name: string;
  code: string;
  warehouseName: string;
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
  const [state, action] = useActionState(moveSackAction, INITIAL);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

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
