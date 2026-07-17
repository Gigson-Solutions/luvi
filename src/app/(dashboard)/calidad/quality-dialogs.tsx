"use client";

import { useActionState, useState, useMemo } from "react";
import { Plus, Pencil, AlertTriangle } from "lucide-react";
import type { QualityResult } from "@prisma/client";
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
  createQualityRecordAction,
  updateQualityResultAction,
  type ActionState,
} from "./actions";
import {
  MEASURE_KEYS,
  MEASURE_LABELS,
  formatThreshold,
  getOutOfRangeMeasures,
  SAMPLE_TYPES,
  SAMPLE_TYPE_LABELS,
  type MeasureKey,
} from "./quality-thresholds";

const INITIAL: ActionState = { ok: false };

interface Option {
  id: string;
  name: string;
  code: string;
}

interface LotOption {
  id: string;
  lotNumber: string;
  materialId: string;
  materialName: string;
}

const RESULT_OPTIONS: { value: QualityResult; label: string }[] = [
  { value: "OK", label: "OK" },
  { value: "NOK", label: "NOK" },
  { value: "PENDIENTE", label: "Pendiente" },
];

// ─── Diálogo: nuevo registro de calidad ─────────────────────────────────────────
export function NewQualityDialog({
  lots,
  materials,
  suppliers,
}: {
  lots: LotOption[];
  materials: Option[];
  suppliers: Option[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await createQualityRecordAction(prev, formData);
      if (res.ok) setOpen(false);
      return res;
    },
    INITIAL,
  );

  const [lotId, setLotId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [result, setResult] = useState<QualityResult>("PENDIENTE");
  const [measures, setMeasures] = useState<Record<MeasureKey, string>>(() =>
    MEASURE_KEYS.reduce(
      (acc, k) => ({ ...acc, [k]: "" }),
      {} as Record<MeasureKey, string>,
    ),
  );

  const outOfRange = useMemo<MeasureKey[]>(() => {
    const parsed: Record<string, number | undefined> = {};
    for (const k of MEASURE_KEYS) {
      const v = measures[k];
      parsed[k] = v === "" ? undefined : Number(v);
    }
    return getOutOfRangeMeasures(parsed);
  }, [measures]);

  const needsOverride = result === "OK" && outOfRange.length > 0;

  function onLotChange(id: string): void {
    setLotId(id);
    const lot = lots.find((l) => l.id === id);
    if (lot) setMaterialId(lot.materialId);
  }

  if (lots.length === 0) {
    return (
      <Button disabled title="No hay lotes de producción">
        <Plus className="w-4 h-4" /> Nuevo registro
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nuevo registro
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuevo registro de calidad"
        description="Evalúa un lote de producción: medidas, resultado y turno."
      >
        <form action={action} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lotId">Lote</Label>
              <Select
                id="lotId"
                name="lotId"
                required
                value={lotId}
                onChange={(e) => onLotChange(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotNumber} · {l.materialName}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="materialId">Material</Label>
              <Select
                id="materialId"
                name="materialId"
                required
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
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
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="supplierId">Proveedor (opcional)</Label>
              <Select id="supplierId" name="supplierId" defaultValue="">
                <option value="">Sin proveedor</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="sampleType">Tipo de muestra</Label>
              <Select id="sampleType" name="sampleType" defaultValue="">
                <option value="">Sin definir</option>
                {SAMPLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SAMPLE_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="shift">Turno</Label>
              <Select id="shift" name="shift" defaultValue="">
                <option value="">Sin definir</option>
                <option value="M">Mañana</option>
                <option value="T">Tarde</option>
                <option value="N">Noche</option>
              </Select>
            </div>
          </div>

          {/* Rejilla de medidas */}
          <div>
            <Label>Medidas</Label>
            <div className="grid grid-cols-3 gap-3 mt-1">
              {MEASURE_KEYS.map((key) => {
                const isOut = outOfRange.includes(key);
                return (
                  <div key={key}>
                    <label
                      htmlFor={key}
                      className="text-xs text-[var(--color-muted)] block mb-1"
                    >
                      {MEASURE_LABELS[key]}
                    </label>
                    <Input
                      id={key}
                      name={key}
                      type="number"
                      step="0.01"
                      value={measures[key]}
                      onChange={(e) =>
                        setMeasures((m) => ({ ...m, [key]: e.target.value }))
                      }
                      placeholder={formatThreshold(key)}
                      className={isOut ? "border-red-500" : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="result">Resultado</Label>
            <Select
              id="result"
              name="result"
              required
              value={result}
              onChange={(e) => setResult(e.target.value as QualityResult)}
            >
              {RESULT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          {needsOverride && (
            <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Parámetros fuera de rango:{" "}
                  {outOfRange.map((k) => MEASURE_LABELS[k]).join(", ")}. Indica
                  un motivo para forzar el resultado OK.
                </span>
              </p>
              <Textarea
                name="overrideReason"
                required
                placeholder="Motivo del override…"
              />
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
            <SubmitButton>Guardar registro</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: editar resultado ──────────────────────────────────────────────────
export function EditResultDialog({
  id,
  lotNumber,
  currentResult,
  currentOverrideReason,
}: {
  id: string;
  lotNumber: string;
  currentResult: QualityResult;
  currentOverrideReason: string | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await updateQualityResultAction(prev, formData);
      if (res.ok) setOpen(false);
      return res;
    },
    INITIAL,
  );
  const [result, setResult] = useState<QualityResult>(currentResult);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="w-3.5 h-3.5" /> Resultado
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Editar resultado · ${lotNumber}`}
        description="Cambia el resultado del registro. Añade un motivo si fuerzas OK/NOK."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div>
            <Label htmlFor="edit-result">Resultado</Label>
            <Select
              id="edit-result"
              name="result"
              required
              value={result}
              onChange={(e) => setResult(e.target.value as QualityResult)}
            >
              {RESULT_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="edit-override">Motivo (override)</Label>
            <Textarea
              id="edit-override"
              name="overrideReason"
              defaultValue={currentOverrideReason ?? ""}
              placeholder="Motivo del cambio de resultado…"
            />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Actualizar</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
