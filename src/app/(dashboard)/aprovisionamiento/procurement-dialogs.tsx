"use client";

import { useActionState, useState } from "react";
import { Plus, Ship, Anchor, Factory } from "lucide-react";
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
  createPurchaseOrderAction,
  createShipmentAction,
  markArrivedValenciaAction,
  markArrivedPlantaAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

interface Supplier {
  id: string;
  name: string;
}
interface Material {
  id: string;
  name: string;
}
interface OpenOrder {
  id: string;
  poNumber: string;
  supplierName: string;
  materialName: string | null;
}

// ─── Diálogo: nueva orden de compra ────────────────────────────────────────────
export function NewPurchaseOrderDialog({
  suppliers,
  materials,
}: {
  suppliers: Supplier[];
  materials: Material[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createPurchaseOrderAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nueva orden de compra
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nueva orden de compra"
        description="El nº de PO se genera automáticamente (PO-fecha-secuencial)."
      >
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="po-supplierId">Proveedor</Label>
              <Select
                id="po-supplierId"
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
            <div>
              <Label htmlFor="po-materialId">Material</Label>
              <Select id="po-materialId" name="materialId" defaultValue="">
                <option value="">Sin definir</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="po-orderedTons">Toneladas pedidas (TM)</Label>
              <Input
                id="po-orderedTons"
                name="orderedTons"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
              />
            </div>
            <div>
              <Label htmlFor="po-pricePerTon">Precio compra (€/t)</Label>
              <Input
                id="po-pricePerTon"
                name="pricePerTon"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="po-notes">Notas</Label>
            <Textarea id="po-notes" name="notes" />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Crear orden</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: nuevo envío de proveedor ─────────────────────────────────────────
export function NewShipmentDialog({
  openOrders,
}: {
  openOrders: OpenOrder[];
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

  const disabled = openOrders.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <Ship className="w-4 h-4" /> Registrar envío
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Registrar envío de proveedor"
        description="Envío marítimo asociado a una orden de compra. Puede agrupar varios contenedores."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="sh-purchaseOrderId">Orden de compra</Label>
            <Select
              id="sh-purchaseOrderId"
              name="purchaseOrderId"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Selecciona…
              </option>
              {openOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.poNumber} · {o.supplierName}
                  {o.materialName ? ` · ${o.materialName}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sh-billOfLading">Bill of Lading</Label>
              <Input
                id="sh-billOfLading"
                name="billOfLading"
                placeholder="BL-…"
              />
            </div>
            <div>
              <Label htmlFor="sh-origin">Puerto de origen</Label>
              <Input id="sh-origin" name="origin" placeholder="Shanghái" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sh-vessel">Barco (vessel)</Label>
              <Input id="sh-vessel" name="vessel" placeholder="MSC …" />
            </div>
            <div>
              <Label htmlFor="sh-weightKg">Peso (kg)</Label>
              <Input
                id="sh-weightKg"
                name="weightKg"
                type="number"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sh-etaValencia">ETA Valencia</Label>
              <Input id="sh-etaValencia" name="etaValencia" type="date" />
            </div>
            <div>
              <Label htmlFor="sh-etaPlanta">ETA Planta</Label>
              <Input id="sh-etaPlanta" name="etaPlanta" type="date" />
            </div>
          </div>
          <div>
            <Label htmlFor="sh-numContainers">
              Nº de contenedores (opcional)
            </Label>
            <Input
              id="sh-numContainers"
              name="numContainers"
              type="number"
              min={0}
              defaultValue={0}
            />
          </div>
          <div>
            <Label htmlFor="sh-notes">Notas</Label>
            <Textarea id="sh-notes" name="notes" />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Registrar envío</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Botón de hito de tránsito ─────────────────────────────────────────────────
export function TransitMilestoneButton({
  shipmentId,
  milestone,
}: {
  shipmentId: string;
  milestone: "valencia" | "planta";
}): React.JSX.Element {
  const [state, action] = useActionState(
    milestone === "valencia"
      ? markArrivedValenciaAction
      : markArrivedPlantaAction,
    INITIAL,
  );

  return (
    <form action={action} className="inline">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <SubmitButton
        variant="outline"
        pendingText="…"
        className="h-8 px-3 text-xs gap-1.5"
      >
        {milestone === "valencia" ? (
          <>
            <Anchor className="w-3.5 h-3.5" /> Llegó a Valencia
          </>
        ) : (
          <>
            <Factory className="w-3.5 h-3.5" /> Llegó a planta
          </>
        )}
      </SubmitButton>
      {state.error && (
        <span className="ml-2 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
