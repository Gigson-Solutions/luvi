"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, CheckCircle2, Truck, PackageCheck } from "lucide-react";
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
interface LotOption {
  id: string;
  lotNumber: string;
  materialName: string;
  availableKg: number;
  availableSacks: number;
}

interface SelectedLot {
  lotId: string;
  weightKg: number;
}

// ─── Diálogo: crear envío (BORRADOR) ───────────────────────────────────────────
export function NewShipmentDialog({
  buyers,
  carriers,
  lots,
}: {
  buyers: BuyerOption[];
  carriers: CarrierOption[];
  lots: LotOption[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedLot[]>([]);
  const [lotId, setLotId] = useState("");
  const [weight, setWeight] = useState("");
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createShipmentAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setSelected([]);
        setLotId("");
        setWeight("");
      }
      return result;
    },
    INITIAL,
  );

  const availableLots = lots.filter(
    (l) => !selected.some((s) => s.lotId === l.id),
  );

  function addLot(): void {
    const w = Number(weight);
    if (!lotId || !Number.isFinite(w) || w <= 0) return;
    setSelected((prev) => [...prev, { lotId, weightKg: w }]);
    setLotId("");
    setWeight("");
  }

  function removeLot(id: string): void {
    setSelected((prev) => prev.filter((s) => s.lotId !== id));
  }

  function lotLabel(id: string): string {
    const l = lots.find((x) => x.id === id);
    return l ? `${l.lotNumber} · ${l.materialName}` : id;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nuevo envío
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuevo envío"
        description="Crea un envío en borrador con comprador, transportista y lotes."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="lots" value={JSON.stringify(selected)} />

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
              <Label htmlFor="driverName">Conductor</Label>
              <Input id="driverName" name="driverName" />
            </div>
          </div>

          {/* Selección de lotes */}
          <div>
            <Label>Lotes (Producto Terminado disponible)</Label>
            <div className="flex gap-2 items-end mt-1">
              <div className="flex-1">
                <Select
                  aria-label="Lote"
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                >
                  <option value="">Selecciona un lote…</option>
                  {availableLots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lotNumber} · {l.materialName} ·{" "}
                      {formatKg(l.availableKg)} disp.
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-28">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="kg"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" onClick={addLot}>
                <Plus className="w-4 h-4" /> Añadir
              </Button>
            </div>

            {selected.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {selected.map((s) => (
                  <li
                    key={s.lotId}
                    className="flex items-center justify-between text-sm rounded-lg border border-[var(--color-border)] px-3 py-1.5"
                  >
                    <span className="text-[var(--color-foreground)]">
                      {lotLabel(s.lotId)}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-[var(--color-muted)]">
                        {formatKg(s.weightKg)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLot(s.lotId)}
                        className="text-[var(--color-muted)] hover:text-red-600"
                        aria-label="Quitar lote"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {lots.length === 0 && (
              <p className="text-xs text-[var(--color-muted)] mt-1">
                No hay lotes de Producto Terminado disponibles.
              </p>
            )}
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

export function ExpediteShipmentButton({
  shipmentId,
}: {
  shipmentId: string;
}): React.JSX.Element {
  return (
    <TransitionButton
      shipmentId={shipmentId}
      action={expediteShipmentAction}
      label="Expedir"
      pendingText="Expidiendo…"
      icon={Truck}
      variant="primary"
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
