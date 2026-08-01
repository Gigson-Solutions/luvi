"use client";

import { useActionState, useState } from "react";
import { Eye, Plus, QrCode, RotateCcw, Settings2 } from "lucide-react";
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
import { formatDate } from "@/lib/utils";
import type { IncidentNoteView } from "@/lib/services/incident.service";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createIncidentAction,
  setIncidentStatusAction,
  reopenIncidentAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

const STATUS_VALUES = Object.values(IncidentStatus);

interface Warehouse {
  id: string;
  name: string;
  code: string;
}

// ─── Historial de notas (cronológico) ──────────────────────────────────────────
function NotesHistory({
  notes,
}: {
  notes: IncidentNoteView[];
}): React.JSX.Element {
  if (notes.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Sin cambios de estado registrados todavía.
      </p>
    );
  }
  return (
    <ol className="max-h-56 space-y-2 overflow-y-auto pr-1">
      {notes.map((n) => (
        <li
          key={n.id}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              {n.fromStatus && (
                <>
                  <IncidentStatusBadge status={n.fromStatus} />
                  <span className="text-[var(--color-muted)]">→</span>
                </>
              )}
              {n.toStatus && <IncidentStatusBadge status={n.toStatus} />}
            </div>
            <span className="text-xs text-[var(--color-muted)]">
              {formatDate(n.createdAt, true)}
            </span>
          </div>
          {n.note && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm text-[var(--color-foreground)]">
              {n.note}
            </p>
          )}
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {n.actorName ?? "Sistema"}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Cabecera compartida por los diálogos: título + estado actual. */
function IncidentHeader({
  title,
  status,
}: {
  title: string;
  status: IncidentStatus;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2">
      <span className="truncate text-sm font-medium text-[var(--color-foreground)]">
        {title}
      </span>
      <IncidentStatusBadge status={status} />
    </div>
  );
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
  notes,
}: {
  id: string;
  title: string;
  status: IncidentStatus;
  notes: IncidentNoteView[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<IncidentStatus>(status);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await setIncidentStatusAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setConfirmingClose(false);
      }
      return result;
    },
    INITIAL,
  );

  const isClosing = selected === IncidentStatus.CERRADA;

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) {
      setSelected(status);
      setConfirmingClose(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-3.5 h-3.5" /> Gestionar
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Gestionar incidencia"
        description="Cambia el estado de la incidencia y deja una nota del cambio."
      >
        <div className="space-y-4">
          <IncidentHeader title={title} status={status} />

          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">
              Historial de cambios
            </p>
            <NotesHistory notes={notes} />
          </div>

          <form action={action} className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <div>
              <Label htmlFor={`status-${id}`}>Nuevo estado</Label>
              <Select
                id={`status-${id}`}
                name="status"
                value={selected}
                onChange={(e) => {
                  const value = e.target.value as IncidentStatus;
                  setSelected(value);
                  if (value !== IncidentStatus.CERRADA) {
                    setConfirmingClose(false);
                  }
                }}
              >
                {STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {INCIDENT_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`note-${id}`}>Nota (opcional)</Label>
              <Textarea
                id={`note-${id}`}
                name="note"
                placeholder="Describe el motivo del cambio…"
              />
            </div>
            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}

            {isClosing && confirmingClose ? (
              <div className="space-y-3 rounded-lg border border-[var(--color-status-rechazo)] bg-[var(--color-surface-hover)] p-3">
                <p className="text-sm text-[var(--color-foreground)]">
                  ¿Estás seguro de que quieres cerrar esta incidencia?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmingClose(false)}
                  >
                    Cancelar
                  </Button>
                  <SubmitButton variant="danger" pendingText="Cerrando…">
                    Sí, cerrar
                  </SubmitButton>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 pt-1">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                {isClosing ? (
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => setConfirmingClose(true)}
                  >
                    Cerrar incidencia
                  </Button>
                ) : (
                  <SubmitButton pendingText="Actualizando…">
                    Guardar estado
                  </SubmitButton>
                )}
              </div>
            )}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: detalle de incidencia cerrada (+ reabrir si ADMIN/MANAGER) ───────
export function ClosedIncidentDialog({
  id,
  title,
  status,
  notes,
  canReopen,
}: {
  id: string;
  title: string;
  status: IncidentStatus;
  notes: IncidentNoteView[];
  canReopen: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await reopenIncidentAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {canReopen ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" /> Gestionar
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" /> Detalles
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Detalle de incidencia"
        description="Historial de cambios de la incidencia."
      >
        <div className="space-y-4">
          <IncidentHeader title={title} status={status} />

          <div>
            <p className="mb-2 text-xs font-medium text-[var(--color-muted)]">
              Historial de cambios
            </p>
            <NotesHistory notes={notes} />
          </div>

          {canReopen && (
            <form
              action={action}
              className="space-y-4 border-t border-[var(--color-border)] pt-4"
            >
              <input type="hidden" name="id" value={id} />
              <div>
                <Label htmlFor={`reopen-status-${id}`}>Reabrir como</Label>
                <Select
                  id={`reopen-status-${id}`}
                  name="status"
                  defaultValue={IncidentStatus.ABIERTA}
                >
                  <option value={IncidentStatus.ABIERTA}>
                    {INCIDENT_LABELS.ABIERTA}
                  </option>
                  <option value={IncidentStatus.EN_PROCESO}>
                    {INCIDENT_LABELS.EN_PROCESO}
                  </option>
                </Select>
              </div>
              <div>
                <Label htmlFor={`reopen-note-${id}`}>Nota (opcional)</Label>
                <Textarea
                  id={`reopen-note-${id}`}
                  name="note"
                  placeholder="Motivo de la reapertura…"
                />
              </div>
              {state.error && (
                <p className="text-sm text-red-600">{state.error}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancelar
                  </Button>
                </DialogClose>
                <SubmitButton pendingText="Reabriendo…">
                  Reabrir incidencia
                </SubmitButton>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
