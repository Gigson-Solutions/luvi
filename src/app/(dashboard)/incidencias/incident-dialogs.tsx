"use client";

import { useActionState, useState } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { IncidentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { INCIDENT_LABELS } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createIncidentAction,
  advanceIncidentStatusAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface Warehouse {
  id: string;
  name: string;
  code: string;
}

// ─── Diálogo: nueva incidencia ─────────────────────────────────────────────────
export function NewIncidentDialog({
  warehouses,
}: {
  warehouses: Warehouse[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createIncidentAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nueva incidencia
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nueva incidencia"
        description="Registra una incidencia de planta o almacén."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              name="title"
              required
              placeholder="Saca dañada en descarga"
            />
          </div>
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Detalles de la incidencia…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="warehouseId">Almacén</Label>
              <Select id="warehouseId" name="warehouseId" defaultValue="">
                <option value="">Sin definir</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="sackQrCode">QR de saca (opcional)</Label>
              <Input
                id="sackQrCode"
                name="sackQrCode"
                placeholder="SACK-XXXXXXXX"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="photoUrl">Foto (URL)</Label>
            {/* TODO: subida a R2 pendiente — de momento solo se acepta una URL. */}
            <Input
              id="photoUrl"
              name="photoUrl"
              type="url"
              placeholder="https://…"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Crear incidencia</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Botón: avanzar estado del lifecycle ───────────────────────────────────────
const NEXT_STATUS: Partial<Record<IncidentStatus, IncidentStatus>> = {
  [IncidentStatus.ABIERTA]: IncidentStatus.EN_REVISION,
  [IncidentStatus.EN_REVISION]: IncidentStatus.EN_PROCESO,
  [IncidentStatus.EN_PROCESO]: IncidentStatus.RESUELTA,
  [IncidentStatus.RESUELTA]: IncidentStatus.CERRADA,
};

export function AdvanceStatusButton({
  id,
  status,
}: {
  id: string;
  status: IncidentStatus;
}): React.JSX.Element | null {
  const [state, action] = useActionState(advanceIncidentStatusAction, INITIAL);
  const next = NEXT_STATUS[status];

  if (!next) {
    return <span className="text-xs text-[var(--color-muted)]">—</span>;
  }

  return (
    <form action={action} className="inline-flex flex-col items-end gap-0.5">
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" pendingText="Actualizando…">
        <span className="inline-flex items-center gap-1">
          {INCIDENT_LABELS[next]}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </SubmitButton>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
