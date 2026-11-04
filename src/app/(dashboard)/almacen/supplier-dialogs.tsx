"use client";

import { useActionState, useState } from "react";
import { Building2 } from "lucide-react";
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
import {
  setSackSupplierAction,
  setSuppliersForFilteredAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface SupplierOption {
  id: string;
  name: string;
}

// ─── Ficha de la saca: asignar o quitar su proveedor ───────────────────────────
export function SackSupplierForm({
  sackId,
  currentSupplierId,
  suppliers,
}: {
  sackId: string;
  currentSupplierId: string | null;
  suppliers: SupplierOption[];
}): React.JSX.Element {
  const [state, action] = useActionState(setSackSupplierAction, INITIAL);
  return (
    <form action={action} className="space-y-2 pt-3">
      <input type="hidden" name="sackId" value={sackId} />
      <Label htmlFor="sack-supplier">Asignar proveedor</Label>
      <div className="flex items-center gap-2">
        <Select
          id="sack-supplier"
          name="supplierId"
          defaultValue={currentSupplierId ?? ""}
        >
          <option value="">Sin proveedor</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <SubmitButton pendingText="Guardando…" variant="outline">
          Guardar
        </SubmitButton>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="text-sm text-[var(--color-primary)]">{state.message}</p>
      )}
    </form>
  );
}

// ─── Fila del listado: asignar o cambiar el proveedor de UNA saca ──────────────
export function AssignSackSupplierDialog({
  sackId,
  qrCode,
  currentSupplierId,
  suppliers,
}: {
  sackId: string;
  qrCode: string;
  currentSupplierId: string | null;
  suppliers: SupplierOption[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await setSackSupplierAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Building2 className="w-3.5 h-3.5" />{" "}
          {currentSupplierId ? "Cambiar proveedor" : "Asignar proveedor"}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Proveedor de la saca · ${qrCode}`}
        description="Esta saca no viene de un contenedor, así que su proveedor se indica aquí."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="sackId" value={sackId} />
          <div>
            <Label htmlFor={`supplier-${sackId}`}>Proveedor</Label>
            <Select
              id={`supplier-${sackId}`}
              name="supplierId"
              defaultValue={currentSupplierId ?? ""}
            >
              <option value="">Sin proveedor</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
            <SubmitButton pendingText="Guardando…">Guardar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Listado: asignar proveedor a todas las sacas filtradas (sin contenedor) ───
export function AssignSupplierBulkDialog({
  count,
  suppliers,
  filters,
}: {
  /** Sacas que cumplen los filtros actuales. */
  count: number;
  suppliers: SupplierOption[];
  /** Filtros actuales, tal cual están en la URL de Almacén. */
  filters: { name: string; value: string }[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await setSuppliersForFilteredAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Building2 className="w-3.5 h-3.5" /> Asignar proveedor a las {count}
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Asignar proveedor"
        description={`Se asignará el proveedor elegido a las ${count} sacas sin proveedor que ves con los filtros actuales (no solo a las de esta página). Las que vienen de un contenedor no se tocan.`}
      >
        <form action={action} className="space-y-4">
          {filters.map((f, i) => (
            <input key={i} type="hidden" name={f.name} value={f.value} />
          ))}
          <div>
            <Label htmlFor="bulk-supplier">Proveedor</Label>
            <Select
              id="bulk-supplier"
              name="supplierId"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
            <SubmitButton pendingText="Asignando…">
              Asignar a {count} sacas
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
