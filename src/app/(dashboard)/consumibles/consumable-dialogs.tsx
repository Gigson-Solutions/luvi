"use client";

import { useActionState, useState } from "react";
import { Plus, ArrowLeftRight, Undo2 } from "lucide-react";
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
import {
  registerConsumableMovementAction,
  registerPalletMovementAction,
  registerPalletReturnAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface ConsumableOption {
  id: string;
  name: string;
  type: string;
  unit: string;
}

interface BuyerOption {
  id: string;
  name: string;
  code: string;
}

interface PalletConsumableOption {
  id: string;
  name: string;
  unit: string;
}

// ─── Diálogo: movimiento de consumible (entrada / salida) ──────────────────────
export function ConsumableMovementDialog({
  consumables,
}: {
  consumables: ConsumableOption[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await registerConsumableMovementAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Registrar movimiento
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Movimiento de consumible"
        description="Entrada (compra) o salida (ajuste). Actualiza el stock automáticamente."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="consumableId">Consumible</Label>
            <Select
              id="consumableId"
              name="consumableId"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {consumables.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.unit})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="direction">Tipo</Label>
              <Select
                id="direction"
                name="direction"
                required
                defaultValue="entrada"
              >
                <option value="entrada">Entrada (compra)</option>
                <option value="salida">Salida (ajuste)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="quantity">Cantidad</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="reason">Motivo</Label>
            <Input
              id="reason"
              name="reason"
              required
              placeholder="compra, ajuste, expedición…"
            />
          </div>
          <div>
            <Label htmlFor="vehiclePlate">Matrícula (opcional)</Label>
            <Input
              id="vehiclePlate"
              name="vehiclePlate"
              placeholder="1234 ABC"
            />
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
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: devolución de palés (cliente, matrícula, OK / rotos) ─────────────
export function PalletReturnDialog({
  buyers,
  palletConsumables,
  defaultBuyerId,
}: {
  buyers: BuyerOption[];
  palletConsumables: PalletConsumableOption[];
  defaultBuyerId?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await registerPalletReturnAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );
  const [ok, setOk] = useState("");
  const [broken, setBroken] = useState("");
  const received = (Number(ok) || 0) + (Number(broken) || 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {defaultBuyerId ? (
          <Button size="sm">
            <Undo2 className="w-3.5 h-3.5" /> Devolución
          </Button>
        ) : (
          <Button>
            <Undo2 className="w-4 h-4" /> Registrar devolución
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Devolución de palés"
        description="Los OK vuelven al stock; los rotos quedan en histórico. Ambos descuentan la deuda del cliente."
      >
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ret-buyerId">Cliente</Label>
              <Select
                id="ret-buyerId"
                name="buyerId"
                required
                defaultValue={defaultBuyerId ?? ""}
              >
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
              <Label htmlFor="ret-date">Fecha</Label>
              <Input id="ret-date" name="date" type="date" />
            </div>
          </div>

          <div>
            <Label htmlFor="ret-plate">Matrícula del camión</Label>
            <Input id="ret-plate" name="vehiclePlate" placeholder="1234 ABC" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="ret-ok">Palés OK</Label>
              <Input
                id="ret-ok"
                name="okCount"
                type="number"
                min={0}
                value={ok}
                onChange={(e) => setOk(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="ret-broken">Palés rotos</Label>
              <Input
                id="ret-broken"
                name="brokenCount"
                type="number"
                min={0}
                value={broken}
                onChange={(e) => setBroken(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="ret-received">Recibidos</Label>
              <Input
                id="ret-received"
                type="number"
                value={received || ""}
                readOnly
                disabled
                className="text-[var(--color-muted)]"
              />
            </div>
          </div>

          {palletConsumables.length > 1 && (
            <div>
              <Label htmlFor="ret-consumable">Stock destino (OK)</Label>
              <Select
                id="ret-consumable"
                name="palletConsumableId"
                defaultValue={palletConsumables[0]?.id ?? ""}
              >
                {palletConsumables.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="ret-notes">Notas</Label>
            <Textarea id="ret-notes" name="notes" />
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Registrar devolución</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: préstamo / devolución de palés retornables ───────────────────────
export function PalletMovementDialog({
  buyers,
  defaultBuyerId,
}: {
  buyers: BuyerOption[];
  defaultBuyerId?: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await registerPalletMovementAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );
  const [direction, setDirection] = useState<"prestamo" | "devolucion">(
    "prestamo",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {defaultBuyerId ? (
          <Button size="sm" variant="outline">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Movimiento
          </Button>
        ) : (
          <Button variant="outline">
            <ArrowLeftRight className="w-4 h-4" /> Préstamo / devolución
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title="Palés retornables"
        description="Préstamo (+) o devolución (−) de palés en fianza por comprador."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="buyerId">Comprador</Label>
            <Select
              id="buyerId"
              name="buyerId"
              required
              defaultValue={defaultBuyerId ?? ""}
            >
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="direction">Tipo</Label>
              <Select
                id="direction"
                name="direction"
                required
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as "prestamo" | "devolucion")
                }
              >
                <option value="prestamo">Préstamo</option>
                <option value="devolucion">Devolución</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="quantity">Cantidad</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                required
              />
            </div>
          </div>
          {direction === "devolucion" && (
            <div>
              <Label htmlFor="condition">Estado de los palés devueltos</Label>
              <Select
                id="condition"
                name="condition"
                required
                defaultValue="OK"
              >
                <option value="OK">OK</option>
                <option value="NOK">NOK</option>
              </Select>
            </div>
          )}
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
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
