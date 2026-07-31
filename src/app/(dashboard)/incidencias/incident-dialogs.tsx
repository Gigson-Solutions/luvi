"use client";

import { useActionState, useState } from "react";
import { Plus, QrCode, Settings2 } from "lucide-react";
import { IncidentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  INCIDENT_LABELS,
  IncidentStatusBadge,
} from "@/components/ui/status-badge";
import { QrScanner } from "@/components/qr/qr-scanner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createIncidentAction,
  setIncidentStatusAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

const STATUS_VALUES = Object.values(IncidentStatus);

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
  const [sackQr, setSackQr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createIncidentAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setSackQr("");
        setScanning(false);
      }
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* Botón en rojo (peligro) con icono Plus, como Emergent. */}
        <Button variant="danger">
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
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="sackQrCode">QR de saca (opcional)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant={scanning ? "primary" : "outline"}
                  onClick={() => setScanning((s) => !s)}
                  aria-pressed={scanning}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  {scanning ? "Cerrar" : "Escanear"}
                </Button>
              </div>
              <Input
                id="sackQrCode"
                name="sackQrCode"
                value={sackQr}
                onChange={(e) => setSackQr(e.target.value)}
                placeholder="SACK-XXXXXXXX"
              />
            </div>
          </div>
          {scanning && (
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <QrScanner
                onScan={(code) => {
                  setSackQr(code);
                  setScanning(false);
                }}
              />
            </div>
          )}
          <div>
            <Label htmlFor="photo">Foto (opcional)</Label>
            <input
              id="photo"
              name="photo"
              type="file"
              accept="image/*"
              capture="environment"
              className="block w-full text-sm text-[var(--color-foreground)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
            />
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              En el móvil puedes hacer la foto directamente con la cámara.
            </p>
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

// ─── Diálogo: gestionar estado (salto libre a cualquiera de los 5) ─────────────
export function ManageIncidentButton({
  id,
  title,
  status,
}: {
  id: string;
  title: string;
  status: IncidentStatus;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await setIncidentStatusAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-3.5 h-3.5" /> Gestionar
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Gestionar incidencia"
        description="Cambia el estado de la incidencia a cualquiera del ciclo."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
            <span className="text-sm font-medium text-[var(--color-foreground)] truncate">
              {title}
            </span>
            <IncidentStatusBadge status={status} />
          </div>
          <div>
            <Label htmlFor={`status-${id}`}>Nuevo estado</Label>
            <Select id={`status-${id}`} name="status" defaultValue={status}>
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s}>
                  {INCIDENT_LABELS[s]}
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
            <SubmitButton pendingText="Actualizando…">
              Guardar estado
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
