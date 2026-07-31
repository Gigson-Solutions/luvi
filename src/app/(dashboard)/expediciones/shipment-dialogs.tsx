"use client";

import { useActionState, useState } from "react";
import {
  Plus,
  CheckCircle2,
  Truck,
  PackageCheck,
  PackagePlus,
  AlertTriangle,
  X,
} from "lucide-react";
import { LotType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { formatKg } from "@/lib/utils";
import {
  createShipmentAction,
  confirmShipmentAction,
  expediteShipmentAction,
  deliverShipmentAction,
  assignLotAction,
  unassignLotAction,
  createManualLotAction,
  addToLotAction,
  removeSackFromLotAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface BuyerOption {
  id: string;
  name: string;
  code: string;
}
interface CarrierOption {
  id: string;
  name: string;
}

// ─── Diálogo: crear envío VACÍO (BORRADOR) ─────────────────────────────────────
export function NewShipmentDialog({
  buyers,
  carriers,
}: {
  buyers: BuyerOption[];
  carriers: CarrierOption[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createShipmentAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nuevo envío
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuevo envío"
        description="Crea el envío con comprador y transportista. Después le asignas los lotes desde la lista de envíos pendientes."
      >
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="buyerId">Comprador</Label>
              <Select id="buyerId" name="buyerId" required defaultValue="">
                <option value="" disabled>
                  Selecciona…
                </option>
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="carrierId">Transportista</Label>
              <Select id="carrierId" name="carrierId" defaultValue="">
                <option value="">Sin asignar</option>
                {carriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vehiclePlate">Matrícula</Label>
              <Input
                id="vehiclePlate"
                name="vehiclePlate"
                placeholder="0000-XXX"
              />
            </div>
            <div>
              <Label htmlFor="scheduledAt">Fecha programada</Label>
              <Input id="scheduledAt" name="scheduledAt" type="date" />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notas</Label>
            <Textarea id="notes" name="notes" />
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Crear envío</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── GL-42: asignar lote a un envío (botón +) ──────────────────────────────────
export interface AssignableLot {
  id: string;
  lotNumber: string;
  type: LotType;
  materialName: string;
  availableKg: number;
  sackCount: number;
  isOpen: boolean;
}

const TYPE_LABEL: Record<LotType, string> = {
  PRODUCTO_TERMINADO: "Producto Terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
};

export function AssignLotButton({
  shipmentId,
  lots,
}: {
  shipmentId: string;
  lots: AssignableLot[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await assignLotAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="w-3.5 h-3.5" /> Asignar lote
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Asignar lote al envío"
        description="Elige el lote de expediciones que quieres asignar a este envío."
      >
        {lots.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No hay lotes disponibles para asignar. Cierra un lote (22 sacas) o
            crea uno manual.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="shipmentId" value={shipmentId} />
            <div>
              <Label htmlFor="lotId">Lote</Label>
              <Select id="lotId" name="lotId" required defaultValue="">
                <option value="" disabled>
                  Selecciona un lote…
                </option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNumber} · {TYPE_LABEL[l.type]} · {l.materialName} ·{" "}
                    {l.sackCount} sacas · {formatKg(l.availableKg)}
                    {l.isOpen ? " · (abierto)" : ""}
                  </option>
                ))}
              </Select>
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
              <SubmitButton>Asignar</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** GL-42 — quita un lote asignado de un envío en borrador. */
export function UnassignLotButton({
  shipmentId,
  lotId,
}: {
  shipmentId: string;
  lotId: string;
}): React.JSX.Element {
  const [state, action, pending] = useActionState(unassignLotAction, INITIAL);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <input type="hidden" name="lotId" value={lotId} />
      <button
        type="submit"
        disabled={pending}
        className="text-[var(--color-muted)] hover:text-red-600 disabled:opacity-50"
        aria-label="Quitar lote del envío"
        title={state.error ?? "Quitar lote del envío"}
      >
        <X className="w-4 h-4" />
      </button>
    </form>
  );
}

// ─── GL-42: expedir (botón verde camión) con aviso Holded + palés ──────────────
export function ExpediteShipmentButton({
  shipmentId,
  disabled,
}: {
  shipmentId: string;
  disabled?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [returnable, setReturnable] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await expediteShipmentAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" disabled={disabled}>
          <Truck className="w-3.5 h-3.5" /> Expedir
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Expedir envío"
        description="Se generará el albarán en Holded al expedir."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="shipmentId" value={shipmentId} />

          <div className="flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Ojo: al expedir se creará automáticamente un{" "}
              <b>albarán en Holded</b> para este envío. Las sacas pasarán a EN
              TRÁNSITO.
            </span>
          </div>

          <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                name="returnablePallets"
                checked={returnable}
                onChange={(e) => setReturnable(e.target.checked)}
              />
              <span className="font-medium text-[var(--color-foreground)]">
                Palés retornables
              </span>
            </label>
            {returnable && (
              <div>
                <Label htmlFor="palletCount">Nº de palés prestados</Label>
                <Input
                  id="palletCount"
                  name="palletCount"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={1}
                />
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  Se registrará como préstamo de palés al comprador en
                  Consumibles.
                </p>
              </div>
            )}
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Expidiendo…">
              <Truck className="w-4 h-4" /> Expedir y crear albarán
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── GL-41: crear lote manual (subproducto / rechazo) ──────────────────────────
export interface LooseSackOption {
  id: string;
  qrCode: string;
  materialId: string;
  materialName: string;
  weight: number;
}

export function CreateManualLotDialog({
  type,
  sacks,
  maxSacks,
}: {
  type: LotType;
  sacks: LooseSackOption[];
  maxSacks: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createManualLotAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setSelected([]);
      }
      return result;
    },
    INITIAL,
  );

  // Solo se pueden agrupar sacas del mismo material: si hay varias, se limita
  // al material de la primera seleccionada.
  const lockedMaterial =
    selected.length > 0
      ? sacks.find((s) => s.id === selected[0])?.materialId
      : null;

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < maxSacks
          ? [...prev, id]
          : prev,
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PackagePlus className="w-3.5 h-3.5" /> Crear lote
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Crear lote manual · ${TYPE_LABEL[type]}`}
        description={`Selecciona las sacas a agrupar en un lote (máximo ${maxSacks}). Todas deben ser del mismo material.`}
      >
        {sacks.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No hay sacas sueltas de {TYPE_LABEL[type].toLowerCase()} para
            agrupar.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="type" value={type} />
            <input
              type="hidden"
              name="sackIds"
              value={JSON.stringify(selected)}
            />
            <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {sacks.map((s) => {
                const checked = selected.includes(s.id);
                const disabled =
                  !checked &&
                  ((lockedMaterial != null &&
                    s.materialId !== lockedMaterial) ||
                    selected.length >= maxSacks);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${
                      disabled ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(s.id)}
                    />
                    <span className="font-mono text-xs">{s.qrCode}</span>
                    <span className="text-[var(--color-muted)]">
                      {s.materialName}
                    </span>
                    <span className="ml-auto">{formatKg(s.weight)}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-[var(--color-muted)]">
              {selected.length}/{maxSacks} sacas seleccionadas
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
              <SubmitButton>Crear lote ({selected.length})</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── GL-39: añadir sacas sueltas a un lote existente abierto ────────────────────
export interface OpenLotOption {
  id: string;
  lotNumber: string;
  materialId: string;
  sackCount: number;
}

export function AddToLotDialog({
  type,
  sacks,
  openLots,
  maxSacks,
}: {
  type: LotType;
  sacks: LooseSackOption[];
  openLots: OpenLotOption[];
  maxSacks: number;
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [lotId, setLotId] = useState("");
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await addToLotAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setSelected([]);
        setLotId("");
      }
      return result;
    },
    INITIAL,
  );

  // Solo hay lotes abiertos donde meter sacas si existen; si no, no mostramos.
  if (openLots.length === 0) return null;

  const lockedMaterial =
    selected.length > 0
      ? sacks.find((s) => s.id === selected[0])?.materialId
      : null;
  // Lotes candidatos: mismo material que la selección y con hueco.
  const candidateLots = openLots.filter(
    (l) =>
      (lockedMaterial == null || l.materialId === lockedMaterial) &&
      l.sackCount + selected.length <= maxSacks,
  );

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < maxSacks
          ? [...prev, id]
          : prev,
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus className="w-3.5 h-3.5" /> Añadir a lote
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Añadir a lote existente · ${TYPE_LABEL[type]}`}
        description="Selecciona sacas sueltas y el lote abierto donde añadirlas (mismo material, máx 22)."
      >
        {sacks.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No hay sacas sueltas para añadir.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <input
              type="hidden"
              name="sackIds"
              value={JSON.stringify(selected)}
            />
            <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
              {sacks.map((s) => {
                const checked = selected.includes(s.id);
                const disabled =
                  !checked &&
                  ((lockedMaterial != null &&
                    s.materialId !== lockedMaterial) ||
                    selected.length >= maxSacks);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${
                      disabled ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(s.id)}
                    />
                    <span className="font-mono text-xs">{s.qrCode}</span>
                    <span className="text-[var(--color-muted)]">
                      {s.materialName}
                    </span>
                    <span className="ml-auto">{formatKg(s.weight)}</span>
                  </label>
                );
              })}
            </div>
            <div>
              <Label htmlFor="add-lotId">Lote destino</Label>
              <Select
                id="add-lotId"
                name="lotId"
                required
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                disabled={selected.length === 0}
              >
                <option value="" disabled>
                  {selected.length === 0
                    ? "Selecciona sacas primero…"
                    : candidateLots.length === 0
                      ? "Ningún lote con hueco para este material"
                      : "Selecciona un lote…"}
                </option>
                {candidateLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNumber} · {l.sackCount}/{maxSacks}
                  </option>
                ))}
              </Select>
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
              <SubmitButton>Añadir ({selected.length})</SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── GL-39: sacar una saca de un lote no asignado ──────────────────────────────
export function RemoveSackButton({
  sackId,
}: {
  sackId: string;
}): React.JSX.Element {
  const [state, action, pending] = useActionState(
    removeSackFromLotAction,
    INITIAL,
  );
  return (
    <form action={action} className="inline">
      <input type="hidden" name="sackId" value={sackId} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-[var(--color-muted)] hover:text-red-600 disabled:opacity-50"
        title={state.error ?? "Sacar del lote"}
      >
        {pending ? "…" : "Sacar"}
      </button>
    </form>
  );
}

// ─── Botones de transición de estado ───────────────────────────────────────────
type ShipmentAction = typeof confirmShipmentAction;

function TransitionButton({
  shipmentId,
  action,
  label,
  pendingText,
  icon: Icon,
  variant = "primary",
}: {
  shipmentId: string;
  action: ShipmentAction;
  label: string;
  pendingText: string;
  icon: React.ElementType;
  variant?: React.ComponentProps<typeof Button>["variant"];
}): React.JSX.Element {
  const [state, formAction, isPending] = useActionState(action, INITIAL);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <Button type="submit" size="sm" variant={variant} disabled={isPending}>
        <Icon className="w-3.5 h-3.5" /> {isPending ? pendingText : label}
      </Button>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

export function ConfirmShipmentButton({
  shipmentId,
}: {
  shipmentId: string;
}): React.JSX.Element {
  return (
    <TransitionButton
      shipmentId={shipmentId}
      action={confirmShipmentAction}
      label="Confirmar"
      pendingText="Confirmando…"
      icon={CheckCircle2}
      variant="outline"
    />
  );
}

export function DeliverShipmentButton({
  shipmentId,
}: {
  shipmentId: string;
}): React.JSX.Element {
  return (
    <TransitionButton
      shipmentId={shipmentId}
      action={deliverShipmentAction}
      label="Entregado"
      pendingText="Marcando…"
      icon={PackageCheck}
      variant="outline"
    />
  );
}
