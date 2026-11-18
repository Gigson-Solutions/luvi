"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { setSupplierPriceAction, type ActionState } from "./actions";

const INITIAL: ActionState = { ok: false };

/** Precio €/t de un proveedor y producto sin pedido (vacío = quitarlo). */
export function SupplierPriceForm({
  supplierId,
  materialId,
  pricePerTon,
}: {
  supplierId: string;
  materialId: string;
  pricePerTon: number | null;
}): React.JSX.Element {
  const [state, action] = useActionState(setSupplierPriceAction, INITIAL);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="supplierId" value={supplierId} />
      <input type="hidden" name="materialId" value={materialId} />
      <Input
        name="pricePerTon"
        type="number"
        step="0.01"
        min={0}
        defaultValue={pricePerTon ?? ""}
        placeholder="€/t"
        className="w-28"
        aria-label="Precio por tonelada"
      />
      <SubmitButton pendingText="…">Guardar</SubmitButton>
      {state.message || state.error ? (
        <span
          className={
            state.ok ? "text-xs text-green-700" : "text-xs text-red-600"
          }
        >
          {state.ok ? state.message : state.error}
        </span>
      ) : null}
    </form>
  );
}
