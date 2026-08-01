"use client";

import { useActionState, useState } from "react";
import { Plus, Scale, Loader2, Keyboard, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
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

/** Estilo de los campos de pesaje cuando están bloqueados por lectura de báscula. */
const LOCKED_INPUT =
  "bg-[var(--color-surface-hover)] text-[var(--color-muted)] cursor-not-allowed";

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
          <div className="border-t border-[var(--color-border)] pt-3 space-y-3">
            <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide">
              Estimación
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="expectedWeight">Peso estimado (kg)</Label>
                <Input
                  id="expectedWeight"
                  name="expectedWeight"
                  type="number"
                  step="0.01"
                  placeholder="20000"
                />
              </div>
              <div>
                <Label htmlFor="tareWeight">Tara estimada (kg)</Label>
                <Input
                  id="tareWeight"
                  name="tareWeight"
                  type="number"
                  step="0.01"
                  placeholder="5000"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="numSacks">Nº sacas (estimado)</Label>
                <Input id="numSacks" name="numSacks" type="number" />
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
            </div>
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
  estimatedTare,
}: {
  containerId: string;
  reference: string;
  materials: Option[];
  zones: Option[];
  defaultMaterialId?: string | null;
  estimatedSacks?: number | null;
  /** Tara estimada declarada al registrar; pre-rellena el campo Tara. */
  estimatedTare?: number | null;
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
  const [tare, setTare] = useState(
    estimatedTare != null ? String(estimatedTare) : "",
  );
  const [net, setNet] = useState("");
  // Modo del pesaje: "scale" = leer de la báscula Gestruck, "manual" = a mano.
  const [mode, setMode] = useState<"scale" | "manual">("manual");
  // true cuando los pesos vienen de la báscula → campos en solo-lectura.
  const [scaleLocked, setScaleLocked] = useState(false);
  const [reading, setReading] = useState(false);
  // Aviso bajo el pesaje: "warning" (amarillo, p.ej. pesaje a medias) o "info".
  const [notice, setNotice] = useState<{
    tone: "warning" | "info";
    text: string;
  } | null>(null);

  // weightSource enviado a la server action: "gestruck" solo si los pesos
  // están bloqueados por lectura de báscula; en cualquier otro caso, "manual".
  const source: "gestruck" | "manual" =
    mode === "scale" && scaleLocked ? "gestruck" : "manual";

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
    const auto = computeNet(value, tare);
    if (auto !== "") setNet(auto);
  }

  function onTareChange(value: string): void {
    setTare(value);
    const auto = computeNet(gross, value);
    if (auto !== "") setNet(auto);
  }

  /** Activa el modo manual: campos editables, sin bloqueo de báscula. */
  function goManual(): void {
    setMode("manual");
    setScaleLocked(false);
    setNotice(null);
  }

  /** Activa el modo báscula e intenta leer de Gestruck. */
  async function goScale(): Promise<void> {
    setMode("scale");
    setReading(true);
    setNotice(null);
    try {
      const r = await fetchGestruckWeightAction(reference);
      // Lectura correcta: Gestruck devuelve { weight (bruto), tare, net }.
      if (!r.manual && (r.net != null || r.weight != null)) {
        if (r.weight != null) setGross(String(r.weight));
        if (r.tare != null) setTare(String(r.tare));
        const netValue =
          r.net ??
          (r.weight != null && r.tare != null ? r.weight - r.tare : undefined);
        if (netValue != null) setNet(String(netValue));
        setScaleLocked(true);
        // Hora del pesaje leído, para verificar que es el de este camión.
        const when = r.weighedAt
          ? new Date(r.weighedAt).toLocaleString("es-ES", {
              timeZone: "Europe/Madrid",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;
        setNotice({
          tone: "info",
          text: when
            ? `Pesos leídos de la báscula · pesado ${when}. Verifica que es este camión.`
            : "Pesos leídos de la báscula.",
        });
      } else if (r.inProgress) {
        // Pesaje a medias: solo la 1ª pesada → aún no hay neto. Pasamos a manual.
        setScaleLocked(false);
        setMode("manual");
        setNotice({
          tone: "warning",
          text:
            r.reason ??
            "Aún falta la segunda pesada del camión para obtener todos los datos (neto). Espera a que terminen de pesar o introduce el peso a mano.",
        });
      } else {
        // Báscula no disponible/otra causa → manual.
        setScaleLocked(false);
        setMode("manual");
        setNotice({
          tone: "info",
          text: r.reason ?? "Introduce los pesos manualmente.",
        });
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
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="actualWeight" className="mb-0">
                Pesaje (kg) — Bruto · Tara · Neto
              </Label>
              {/* Toggle de modo: Báscula (lee de Gestruck) / Manual (a mano). */}
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "scale" ? "primary" : "outline"}
                  onClick={goScale}
                  disabled={reading}
                  aria-pressed={mode === "scale"}
                >
                  {reading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Scale className="w-4 h-4" />
                  )}
                  Báscula
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "manual" ? "primary" : "outline"}
                  onClick={goManual}
                  disabled={reading}
                  aria-pressed={mode === "manual"}
                >
                  <Keyboard className="w-4 h-4" /> Manual
                </Button>
              </div>
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
                  readOnly={scaleLocked}
                  className={scaleLocked ? LOCKED_INPUT : undefined}
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
                  readOnly={scaleLocked}
                  className={scaleLocked ? LOCKED_INPUT : undefined}
                  placeholder="0.00"
                />
                {estimatedTare != null && (
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">
                    Est.: {estimatedTare} kg
                  </p>
                )}
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
                  onChange={(e) => setNet(e.target.value)}
                  readOnly={scaleLocked}
                  className={scaleLocked ? LOCKED_INPUT : undefined}
                  placeholder="0.00"
                />
              </div>
            </div>
            {scaleLocked && (
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                Pesos leídos de la báscula (solo lectura). Cambia a{" "}
                <span className="font-medium">Manual</span> para editarlos.
              </p>
            )}
            {notice && (
              <div
                className={cn(
                  "flex items-start gap-2 mt-2 rounded-lg border px-3 py-2 text-xs",
                  notice.tone === "warning"
                    ? "border-[var(--color-warning)] bg-[var(--color-warning)]/10 text-[var(--color-foreground)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]",
                )}
                role={notice.tone === "warning" ? "alert" : "status"}
              >
                {notice.tone === "warning" && (
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-[var(--color-warning)]" />
                )}
                <span>{notice.text}</span>
              </div>
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
