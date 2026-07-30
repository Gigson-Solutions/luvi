"use client";

import { useActionState, useState } from "react";
import { Plus, Scale, Loader2 } from "lucide-react";
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
  registerContainerAction,
  weighAndConfirmAction,
  fetchGestruckWeightAction,
  type ActionState,
} from "./actions";
import { SACK_TYPE_OPTIONS } from "@/lib/reception-sack-types";

const INITIAL: ActionState = { ok: false };

interface Option {
  id: string;
  name: string;
  code: string;
  warehouseName?: string;
}

interface ReceptionOptions {
  suppliers: Option[];
  materials: Option[];
  zones: Option[];
  warehouses: Option[];
}

// ─── Diálogo: registro previo de contenedor ────────────────────────────────────
export function NewReceptionDialog({
  suppliers,
  materials,
  warehouses,
}: ReceptionOptions): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await registerContainerAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Registrar contenedor
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Registrar contenedor / camión"
        description="Registro previo antes de la llegada a planta."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="reference">
              Referencia (nº contenedor / matrícula)
            </Label>
            <Input
              id="reference"
              name="reference"
              required
              placeholder="MSKU1234567"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="supplierId">Proveedor</Label>
              <Select
                id="supplierId"
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
              <Label htmlFor="materialId">Material (estimado)</Label>
              <Select id="materialId" name="materialId" defaultValue="">
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
            <Label htmlFor="warehouseId">Almacén destino</Label>
            <Select id="warehouseId" name="warehouseId" defaultValue="">
              <option value="">Sin definir</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="expectedWeight">Peso estimado (kg)</Label>
              <Input
                id="expectedWeight"
                name="expectedWeight"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="numSacks">Nº sacas (estimado)</Label>
              <Input id="numSacks" name="numSacks" type="number" />
            </div>
          </div>
          <div>
            <Label htmlFor="sackType">Tipo de saca</Label>
            <Select id="sackType" name="sackType" defaultValue="">
              <option value="">Sin definir</option>
              {SACK_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="billOfLading">Bill of Lading</Label>
              <Input id="billOfLading" name="billOfLading" />
            </div>
            <div>
              <Label htmlFor="estimatedArrival">Llegada prevista</Label>
              <Input
                id="estimatedArrival"
                name="estimatedArrival"
                type="date"
              />
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
            <SubmitButton>Registrar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: pesar + recibir (genera sacas) ───────────────────────────────────
export function ReceiveDialog({
  containerId,
  reference,
  materials,
  zones,
  defaultMaterialId,
  estimatedSacks,
}: {
  containerId: string;
  reference: string;
  materials: Option[];
  zones: Option[];
  defaultMaterialId?: string | null;
  estimatedSacks?: number | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await weighAndConfirmAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );
  // Bruto / Tara / Neto. El Neto es el que se guarda en actualWeight (requerido);
  // Bruto → grossWeight, Tara → tareWeight (ambos opcionales).
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const [net, setNet] = useState("");
  const [source, setSource] = useState<"gestruck" | "manual">("manual");
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState<string | null>(null);

  /** Neto = Bruto − Tara cuando ambos son números válidos. */
  function computeNet(grossStr: string, tareStr: string): string {
    const g = parseFloat(grossStr);
    const t = parseFloat(tareStr);
    if (Number.isFinite(g) && Number.isFinite(t)) {
      return String(Math.round((g - t) * 100) / 100);
    }
    return "";
  }

  function onGrossChange(value: string): void {
    setGross(value);
    setSource("manual");
    const auto = computeNet(value, tare);
    if (auto !== "") setNet(auto);
  }

  function onTareChange(value: string): void {
    setTare(value);
    setSource("manual");
    const auto = computeNet(gross, value);
    if (auto !== "") setNet(auto);
  }

  async function readFromScale(): Promise<void> {
    setReading(true);
    setReadMsg(null);
    try {
      const r = await fetchGestruckWeightAction(reference);
      // La lectura de Gestruck devuelve { weight (bruto), tare, net }.
      if (!r.manual && (r.net != null || r.weight != null)) {
        if (r.weight != null) setGross(String(r.weight));
        if (r.tare != null) setTare(String(r.tare));
        const netValue =
          r.net ??
          (r.weight != null && r.tare != null ? r.weight - r.tare : undefined);
        if (netValue != null) setNet(String(netValue));
        setSource("gestruck");
        // Hora del pesaje leído, para que el operario verifique que es el de este camión.
        const when = r.weighedAt
          ? new Date(r.weighedAt).toLocaleString("es-ES", {
              timeZone: "Europe/Madrid",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;
        setReadMsg(
          when
            ? `Pesos leídos de la báscula · pesado ${when}. Verifica que es este camión.`
            : "Pesos leídos de la báscula.",
        );
      } else {
        setSource("manual");
        setReadMsg(r.reason ?? "Introduce los pesos manualmente.");
      }
    } finally {
      setReading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary">
          <Scale className="w-3.5 h-3.5" /> Pesar y recibir
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Recepción · ${reference}`}
        description="Pesa (Gestruck o manual), asigna almacén y genera las sacas."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="containerId" value={containerId} />
          <input type="hidden" name="weightSource" value={source} />

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label htmlFor="actualWeight" className="mb-0">
                Pesaje (kg) — Bruto · Tara · Neto
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={readFromScale}
                disabled={reading}
              >
                {reading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Scale className="w-4 h-4" />
                )}
                Báscula
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="grossWeight" className="text-xs">
                  Bruto
                </Label>
                <Input
                  id="grossWeight"
                  name="grossWeight"
                  type="number"
                  step="0.01"
                  value={gross}
                  onChange={(e) => onGrossChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="tareWeight" className="text-xs">
                  Tara
                </Label>
                <Input
                  id="tareWeight"
                  name="tareWeight"
                  type="number"
                  step="0.01"
                  value={tare}
                  onChange={(e) => onTareChange(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="actualWeight" className="text-xs">
                  Neto *
                </Label>
                <Input
                  id="actualWeight"
                  name="actualWeight"
                  type="number"
                  step="0.01"
                  required
                  value={net}
                  onChange={(e) => {
                    setNet(e.target.value);
                    setSource("manual");
                  }}
                  placeholder="0.00"
                />
              </div>
            </div>
            {readMsg && (
              <p className="text-xs text-[var(--color-muted)] mt-1">
                {readMsg}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="materialId">Material</Label>
              <Select
                id="materialId"
                name="materialId"
                required
                defaultValue={defaultMaterialId ?? ""}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="zoneId">Almacén destino</Label>
              <Select id="zoneId" name="zoneId" required defaultValue="">
                <option value="" disabled>
                  Selecciona…
                </option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.warehouseName} · {z.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="numSacks">Nº de sacas</Label>
              <Input
                id="numSacks"
                name="numSacks"
                type="number"
                required
                defaultValue={estimatedSacks ?? undefined}
              />
            </div>
            <div>
              <Label htmlFor="numPallets">Nº de palés</Label>
              <Input
                id="numPallets"
                name="numPallets"
                type="number"
                defaultValue={0}
              />
            </div>
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton pendingText="Generando sacas…">
              Confirmar recepción
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
