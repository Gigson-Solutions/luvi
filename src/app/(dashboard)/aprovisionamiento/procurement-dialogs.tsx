"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Ship, Anchor, Factory, Trash2 } from "lucide-react";
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

// ─── Diálogo: nueva orden de compra (GL-44) ────────────────────────────────────
export function NewPurchaseOrderDialog({
  suppliers,
  materials,
}: {
  suppliers: Supplier[];
  materials: Material[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [orderedTons, setOrderedTons] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createPurchaseOrderAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  // Feedback en vivo del precio por tonelada = precio total / toneladas pedidas.
  const pricePerTon = useMemo(() => {
    const tons = Number(orderedTons);
    const price = Number(totalPrice);
    if (!Number.isFinite(tons) || tons <= 0) return null;
    if (!Number.isFinite(price) || totalPrice.trim() === "") return null;
    return Math.round((price / tons) * 10000) / 10000;
  }, [orderedTons, totalPrice]);

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
          <div>
            <Label htmlFor="po-originPort">Puerto / país de origen</Label>
            <Input
              id="po-originPort"
              name="originPort"
              placeholder="Shanghái · China"
            />
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
                value={orderedTons}
                onChange={(e) => setOrderedTons(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="po-totalPrice">Precio total del pedido (€)</Label>
              <Input
                id="po-totalPrice"
                name="totalPrice"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {pricePerTon != null ? (
                  <>
                    ≈{" "}
                    <span className="font-medium text-[var(--color-foreground)]">
                      {pricePerTon.toFixed(2)} €/t
                    </span>
                  </>
                ) : (
                  "El €/t se calcula al indicar precio y toneladas."
                )}
              </p>
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

// ─── Diálogo: nuevo envío dentro de una orden de compra (GL-45 / GL-50 / GL-57) ──
interface ContainerPair {
  billOfLading: string;
  reference: string;
  /** Peso individual del contenedor en kg (GL-57). */
  weight: string;
}

const EMPTY_PAIR: ContainerPair = {
  billOfLading: "",
  reference: "",
  weight: "",
};

export function NewShipmentDialog({
  purchaseOrderId,
  poNumber,
}: {
  purchaseOrderId: string;
  poNumber: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [departureDate, setDepartureDate] = useState("");
  const [etaValencia, setEtaValencia] = useState("");
  const [etaPlanta, setEtaPlanta] = useState("");
  const [pairs, setPairs] = useState<ContainerPair[]>([{ ...EMPTY_PAIR }]);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createShipmentAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        setDepartureDate("");
        setEtaValencia("");
        setEtaPlanta("");
        setPairs([{ ...EMPTY_PAIR }]);
      }
      return result;
    },
    INITIAL,
  );

  // Suma total del peso del envío = Σ pesos de contenedores (GL-57).
  const totalWeight = useMemo(
    () =>
      pairs.reduce((acc, p) => {
        const w = Number(p.weight);
        return acc + (Number.isFinite(w) && p.weight.trim() !== "" ? w : 0);
      }, 0),
    [pairs],
  );

  // Pares serializados para el Server Action (solo filas con BL y contenedor).
  const containersJson = useMemo(
    () =>
      JSON.stringify(
        pairs
          .map((p) => {
            const weight = Number(p.weight);
            return {
              billOfLading: p.billOfLading.trim(),
              reference: p.reference.trim(),
              weight:
                p.weight.trim() !== "" && Number.isFinite(weight)
                  ? weight
                  : undefined,
            };
          })
          .filter((p) => p.billOfLading !== "" && p.reference !== ""),
      ),
    [pairs],
  );

  function updatePair(index: number, patch: Partial<ContainerPair>): void {
    setPairs((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );
  }
  function addPair(): void {
    setPairs((prev) => [...prev, { ...EMPTY_PAIR }]);
  }
  function removePair(index: number): void {
    setPairs((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== index),
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs gap-1.5"
        >
          <Ship className="w-3.5 h-3.5" /> Nuevo envío
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuevo envío"
        description={`Envío marítimo del pedido ${poNumber}. Agrupa uno o varios contenedores.`}
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <input type="hidden" name="containers" value={containersJson} />

          <div>
            <Label htmlFor="sh-departureDate">Fecha de salida</Label>
            <Input
              id="sh-departureDate"
              name="departureDate"
              type="date"
              required
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sh-etaValencia">ETA Valencia</Label>
              <Input
                id="sh-etaValencia"
                name="etaValencia"
                type="date"
                required
                value={etaValencia}
                onChange={(e) => setEtaValencia(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sh-etaPlanta">Fecha de llegada a planta</Label>
              <Input
                id="sh-etaPlanta"
                name="etaPlanta"
                type="date"
                required
                value={etaPlanta}
                onChange={(e) => setEtaPlanta(e.target.value)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="mb-0">
                Contenedores (BL ↔ Contenedor · Peso)
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={addPair}
              >
                <Plus className="w-3.5 h-3.5" /> Añadir
              </Button>
            </div>
            <div className="space-y-2">
              {pairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Bill of Lading ${i + 1}`}
                    placeholder="BL-…"
                    value={pair.billOfLading}
                    onChange={(e) =>
                      updatePair(i, { billOfLading: e.target.value })
                    }
                  />
                  <Input
                    aria-label={`Contenedor ${i + 1}`}
                    placeholder="Contenedor ID"
                    value={pair.reference}
                    onChange={(e) =>
                      updatePair(i, { reference: e.target.value })
                    }
                  />
                  <Input
                    aria-label={`Peso contenedor ${i + 1} (kg)`}
                    placeholder="Peso (kg)"
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28 shrink-0"
                    value={pair.weight}
                    onChange={(e) => updatePair(i, { weight: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2 shrink-0"
                    onClick={() => removePair(i)}
                    disabled={pairs.length === 1}
                    aria-label={`Quitar contenedor ${i + 1}`}
                  >
                    <Trash2 className="w-4 h-4 text-[var(--color-muted)]" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] px-3 py-2 text-sm">
              <span className="text-[var(--color-muted)]">
                Peso total del envío
              </span>
              <span className="font-medium text-[var(--color-foreground)]">
                {totalWeight.toLocaleString("es-ES", {
                  maximumFractionDigits: 2,
                })}{" "}
                kg
              </span>
            </div>
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
