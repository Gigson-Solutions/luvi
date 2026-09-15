"use client";

import { useActionState, useState } from "react";
import { Plus, Truck } from "lucide-react";
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
  addBrokenPalletsAction,
  shipBrokenPalletsAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

/*
 * Los campos van controlados: React resetea los campos no controlados de un
 * <form action> al terminar la acción, y tras un error del servidor el usuario
 * perdería lo que había elegido. El error se oculta en cuanto se toca un campo.
 */

// ─── Diálogo: entrada manual de palés rotos ─────────────────────────────────────
export function AddBrokenPalletsDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [showError, setShowError] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await addBrokenPalletsAction(prev, formData);
      setShowError(!result.ok);
      if (result.ok) {
        setOpen(false);
        setQuantity("");
        setNotes("");
      }
      return result;
    },
    INITIAL,
  );

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) setShowError(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="w-4 h-4" /> Añadir palés rotos
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Añadir palés rotos"
        description="Entrada manual al stock de palés rotos."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="bp-add-quantity">Cantidad</Label>
            <Input
              id="bp-add-quantity"
              name="quantity"
              type="number"
              min={1}
              step={1}
              required
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setShowError(false);
              }}
              placeholder="0"
            />
          </div>
          <div>
            <Label htmlFor="bp-add-notes">Notas</Label>
            <Textarea
              id="bp-add-notes"
              name="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setShowError(false);
              }}
            />
          </div>

          {showError && state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Añadir</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: salida de palés rotos ─────────────────────────────────────────────
export function ShipBrokenPalletsDialog({
  recipients,
  available,
}: {
  recipients: { id: string; name: string }[];
  available: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [buyerId, setBuyerId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [showError, setShowError] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await shipBrokenPalletsAction(prev, formData);
      setShowError(!result.ok);
      if (result.ok) {
        setOpen(false);
        setBuyerId("");
        setQuantity("");
        setNotes("");
      }
      return result;
    },
    INITIAL,
  );
  const tooMany = (Number(quantity) || 0) > available;

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) setShowError(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={available <= 0}>
          <Truck className="w-4 h-4" /> Registrar salida
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Salida de palés rotos"
        description="Descuenta los palés del stock y genera el albarán en Holded."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="bp-ship-buyer">Destinatario</Label>
            <Select
              id="bp-ship-buyer"
              name="buyerId"
              required
              value={buyerId}
              onChange={(e) => {
                setBuyerId(e.target.value);
                setShowError(false);
              }}
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="bp-ship-quantity">Cantidad</Label>
            <Input
              id="bp-ship-quantity"
              name="quantity"
              type="number"
              min={1}
              max={available}
              step={1}
              required
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setShowError(false);
              }}
              placeholder="0"
            />
            <p
              className={
                tooMany
                  ? "mt-1 text-xs text-red-600"
                  : "mt-1 text-xs text-[var(--color-muted)]"
              }
            >
              {tooMany
                ? `Solo hay ${available} palés rotos disponibles.`
                : `Disponibles: ${available}`}
            </p>
          </div>
          <div>
            <Label htmlFor="bp-ship-notes">Notas</Label>
            <Textarea
              id="bp-ship-notes"
              name="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setShowError(false);
              }}
            />
          </div>

          {showError && state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton disabled={tooMany}>Confirmar salida</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
