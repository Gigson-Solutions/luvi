"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Ship, Anchor, Factory, Trash2, Pencil } from "lucide-react";
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
  updatePurchaseOrderAction,
  setPurchaseOrderStatusAction,
  createShipmentAction,
  updateShipmentAction,
  setShipmentStageAction,
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

/** Datos de un pedido para precargar el formulario de edición. */
export interface OrderFormValues {
  id: string;
  poNumber: string;
  supplierId: string;
  materialId: string | null;
  orderedTons: number;
  originPort: string | null;
  totalPrice: number | null;
  pricePerTon: number | null;
  oceanFreightPerContainer: number | null;
  arrivalCostsPerContainer: number | null;
  arrivalCostsPerShipment: number | null;
  deliveryTransportPerContainer: number | null;
  additionalCostsPerShipment: number | null;
  customsDuties: number | null;
  notes: string | null;
  status: string;
  statusManual: boolean;
}

/** Campo numérico opcional de coste, con su unidad como pista. */
function CostField({
  id,
  name,
  label,
  hint,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  defaultValue?: number | null;
}): React.JSX.Element {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        step="0.01"
        min="0"
        placeholder="0.00"
        defaultValue={defaultValue ?? ""}
      />
      <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>
    </div>
  );
}

/**
 * Campos comunes del pedido (alta y edición): cabecera y costes. Los costes
 * quedan editables siempre; el reparto entre embarques y la conversión de
 * moneda no entran aquí.
 */
function PurchaseOrderFields({
  suppliers,
  materials,
  order,
  idPrefix,
}: {
  suppliers: Supplier[];
  materials: Material[];
  order?: OrderFormValues;
  idPrefix: string;
}): React.JSX.Element {
  const [orderedTons, setOrderedTons] = useState(
    order ? String(order.orderedTons) : "",
  );
  const [totalPrice, setTotalPrice] = useState(
    order?.totalPrice != null ? String(order.totalPrice) : "",
  );

  // Feedback en vivo del precio por tonelada = precio total / toneladas pedidas.
  const derivedPricePerTon = useMemo(() => {
    const tons = Number(orderedTons);
    const price = Number(totalPrice);
    if (!Number.isFinite(tons) || tons <= 0) return null;
    if (!Number.isFinite(price) || totalPrice.trim() === "") return null;
    return Math.round((price / tons) * 10000) / 10000;
  }, [orderedTons, totalPrice]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}supplierId`}>Proveedor</Label>
          <Select
            id={`${idPrefix}supplierId`}
            name="supplierId"
            required
            defaultValue={order?.supplierId ?? ""}
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
          <Label htmlFor={`${idPrefix}materialId`}>Material</Label>
          <Select
            id={`${idPrefix}materialId`}
            name="materialId"
            defaultValue={order?.materialId ?? ""}
          >
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
        <Label htmlFor={`${idPrefix}originPort`}>Puerto / país de origen</Label>
        <Input
          id={`${idPrefix}originPort`}
          name="originPort"
          placeholder="Shanghái · China"
          defaultValue={order?.originPort ?? ""}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${idPrefix}orderedTons`}>
            Toneladas pedidas (TM)
          </Label>
          <Input
            id={`${idPrefix}orderedTons`}
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
          <Label htmlFor={`${idPrefix}totalPrice`}>
            Precio total del pedido (€)
          </Label>
          <Input
            id={`${idPrefix}totalPrice`}
            name="totalPrice"
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={totalPrice}
            onChange={(e) => setTotalPrice(e.target.value)}
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {derivedPricePerTon != null ? (
              <>
                ≈{" "}
                <span className="font-medium text-[var(--color-foreground)]">
                  {derivedPricePerTon.toFixed(2)} €/t
                </span>
              </>
            ) : (
              "El €/t se calcula al indicar precio y toneladas."
            )}
          </p>
        </div>
      </div>

      {/* Costes del pedido, cada uno en su unidad */}
      <div className="rounded-xl border border-[var(--color-border)] p-3">
        <p className="mb-3 text-sm font-medium text-[var(--color-foreground)]">
          Costes del pedido
        </p>
        <div className="grid grid-cols-2 gap-3">
          <CostField
            id={`${idPrefix}pricePerTon`}
            name="pricePerTon"
            label="Precio de la mercancía"
            hint="€ por tonelada. Vacío = se deriva del precio total."
            defaultValue={order?.pricePerTon}
          />
          <CostField
            id={`${idPrefix}oceanFreight`}
            name="oceanFreightPerContainer"
            label="Flete marítimo"
            hint="€ por contenedor."
            defaultValue={order?.oceanFreightPerContainer}
          />
          <CostField
            id={`${idPrefix}arrivalContainer`}
            name="arrivalCostsPerContainer"
            label="Gastos de llegada (contenedor)"
            hint="€ por contenedor."
            defaultValue={order?.arrivalCostsPerContainer}
          />
          <CostField
            id={`${idPrefix}arrivalShipment`}
            name="arrivalCostsPerShipment"
            label="Gastos de llegada (embarque)"
            hint="€ por embarque."
            defaultValue={order?.arrivalCostsPerShipment}
          />
          <CostField
            id={`${idPrefix}deliveryTransport`}
            name="deliveryTransportPerContainer"
            label="Transporte de entrega"
            hint="€ por contenedor."
            defaultValue={order?.deliveryTransportPerContainer}
          />
          <CostField
            id={`${idPrefix}additionalCosts`}
            name="additionalCostsPerShipment"
            label="Gastos adicionales"
            hint="€ por embarque."
            defaultValue={order?.additionalCostsPerShipment}
          />
          <CostField
            id={`${idPrefix}customsDuties`}
            name="customsDuties"
            label="Gastos arancelarios"
            hint="€ del pedido."
            defaultValue={order?.customsDuties}
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`${idPrefix}notes`}>Notas</Label>
        <Textarea
          id={`${idPrefix}notes`}
          name="notes"
          defaultValue={order?.notes ?? ""}
        />
      </div>
    </>
  );
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
          <PurchaseOrderFields
            suppliers={suppliers}
            materials={materials}
            idPrefix="po-"
          />
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

// ─── Diálogo: editar orden de compra (costes incluidos) ─────────────────────────
export function EditPurchaseOrderDialog({
  order,
  suppliers,
  materials,
}: {
  order: OrderFormValues;
  suppliers: Supplier[];
  materials: Material[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await updatePurchaseOrderAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" /> Editar pedido
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Editar pedido ${order.poNumber}`}
        description="Los importes se pueden cambiar en cualquier momento."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={order.id} />
          <PurchaseOrderFields
            suppliers={suppliers}
            materials={materials}
            order={order}
            idPrefix={`po-${order.id}-`}
          />
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Guardar cambios</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Corregir el estado del pedido (avanzar o retroceder) ───────────────────────
const ORDER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "ABIERTA", label: "Abierta" },
  { value: "EN_TRANSITO", label: "En tránsito" },
  { value: "RECIBIDA_PARCIAL", label: "Recibida parcial" },
  { value: "COMPLETADA", label: "Completada" },
  { value: "CANCELADA", label: "Cancelada" },
];

export function OrderStatusSelect({
  orderId,
  status,
  statusManual,
}: {
  orderId: string;
  status: string;
  statusManual: boolean;
}): React.JSX.Element {
  const [state, action] = useActionState(
    setPurchaseOrderStatusAction,
    INITIAL,
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={orderId} />
      <Select
        name="status"
        value={statusManual ? status : "AUTO"}
        className="h-8 w-auto min-w-40 text-xs"
        aria-label="Estado del pedido"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="AUTO">Automático ({status})</option>
        {ORDER_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

// ─── Diálogo: nuevo envío dentro de una orden de compra (GL-45 / GL-50 / GL-57) ──
interface ContainerPair {
  /** Id del contenedor ya existente (solo en edición). */
  id?: string;
  billOfLading: string;
  reference: string;
  /** Peso individual del contenedor en kg (GL-57). */
  weight: string;
  /** Contenedor ya recibido: no se puede quitar del envío. */
  locked?: boolean;
}

const EMPTY_PAIR: ContainerPair = {
  billOfLading: "",
  reference: "",
  weight: "",
};

/** Valores de un envío existente para precargar el formulario de edición. */
export interface ShipmentFormValues {
  id: string;
  departureDate: string;
  etaValencia: string;
  etaPlanta: string;
  notes: string;
  containers: ContainerPair[];
}

/**
 * Formulario de envío compartido por el alta y la edición. En edición se
 * arrastra el id de cada contenedor para actualizarlo en vez de recrearlo.
 */
function ShipmentDialogBase({
  trigger,
  title,
  description,
  action: serverAction,
  hidden,
  initial,
  submitLabel,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  hidden: { name: string; value: string };
  initial?: ShipmentFormValues;
  submitLabel: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [departureDate, setDepartureDate] = useState(
    initial?.departureDate ?? "",
  );
  const [etaValencia, setEtaValencia] = useState(initial?.etaValencia ?? "");
  const [etaPlanta, setEtaPlanta] = useState(initial?.etaPlanta ?? "");
  const [pairs, setPairs] = useState<ContainerPair[]>(
    initial?.containers.length ? initial.containers : [{ ...EMPTY_PAIR }],
  );
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await serverAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        if (!initial) {
          setDepartureDate("");
          setEtaValencia("");
          setEtaPlanta("");
          setPairs([{ ...EMPTY_PAIR }]);
        }
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
              id: p.id,
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

  const idPrefix = `sh-${hidden.value}-`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <form action={action} className="space-y-4">
          <input type="hidden" name={hidden.name} value={hidden.value} />
          <input type="hidden" name="containers" value={containersJson} />

          <div>
            <Label htmlFor={`${idPrefix}departureDate`}>Fecha de salida</Label>
            <Input
              id={`${idPrefix}departureDate`}
              name="departureDate"
              type="date"
              required
              value={departureDate}
              onChange={(e) => setDepartureDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={`${idPrefix}etaValencia`}>ETA Valencia</Label>
              <Input
                id={`${idPrefix}etaValencia`}
                name="etaValencia"
                type="date"
                required
                value={etaValencia}
                onChange={(e) => setEtaValencia(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`${idPrefix}etaPlanta`}>
                Fecha de llegada a planta
              </Label>
              <Input
                id={`${idPrefix}etaPlanta`}
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
                    disabled={pairs.length === 1 || pair.locked}
                    title={
                      pair.locked
                        ? "Contenedor ya recibido: no se puede quitar"
                        : undefined
                    }
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
            <Label htmlFor={`${idPrefix}notes`}>Notas</Label>
            <Textarea
              id={`${idPrefix}notes`}
              name="notes"
              defaultValue={initial?.notes ?? ""}
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewShipmentDialog({
  purchaseOrderId,
  poNumber,
}: {
  purchaseOrderId: string;
  poNumber: string;
}): React.JSX.Element {
  return (
    <ShipmentDialogBase
      trigger={
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5">
          <Ship className="w-3.5 h-3.5" /> Nuevo envío
        </Button>
      }
      title="Nuevo envío"
      description={`Envío marítimo del pedido ${poNumber}. Agrupa uno o varios contenedores.`}
      action={createShipmentAction}
      hidden={{ name: "purchaseOrderId", value: purchaseOrderId }}
      submitLabel="Registrar envío"
    />
  );
}

/** Edición de un envío ya creado (fechas, notas y contenedores). */
export function EditShipmentDialog({
  shipment,
}: {
  shipment: ShipmentFormValues;
}): React.JSX.Element {
  return (
    <ShipmentDialogBase
      trigger={
        <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5">
          <Pencil className="w-3.5 h-3.5" /> Editar envío
        </Button>
      }
      title="Editar envío"
      description="Al guardar se actualizan también los contenedores y su fecha prevista de llegada en Recepciones."
      action={updateShipmentAction}
      hidden={{ name: "id", value: shipment.id }}
      initial={shipment}
      submitLabel="Guardar cambios"
    />
  );
}

// ─── Corregir la etapa de tránsito (avanzar o retroceder) ───────────────────────
const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "MARITIMO", label: "En tránsito marítimo" },
  { value: "VALENCIA", label: "Llegado a Valencia" },
  { value: "PLANTA", label: "Llegado a planta" },
];

export function ShipmentStageSelect({
  shipmentId,
  stage,
}: {
  shipmentId: string;
  stage: string;
}): React.JSX.Element {
  const [state, action] = useActionState(setShipmentStageAction, INITIAL);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <Select
        name="stage"
        value={stage}
        className="h-8 w-auto min-w-44 text-xs"
        aria-label="Etapa del envío"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {STAGE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
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
