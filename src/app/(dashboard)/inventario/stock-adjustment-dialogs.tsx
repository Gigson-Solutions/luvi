"use client";

import { useActionState, useState } from "react";
import {
  PackagePlus,
  PackageMinus,
  Printer,
  Check,
  AlertTriangle,
} from "lucide-react";
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
  createStockEntryAction,
  createStockExitAction,
  printStockEntryLabelsAction,
  type ActionState,
} from "./actions";

interface Option {
  id: string;
  name: string;
}

/** Sacas en almacén por producto y ubicación (para validar la baja). */
export interface AvailabilityRow {
  materialId: string;
  zoneId: string | null;
  count: number;
}

const INITIAL: ActionState = { ok: false };

/** "YYYY-MM-DD" de hoy en hora local, valor por defecto de la fecha. */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/*
 * Como en los diálogos de palés rotos, los campos van controlados: React
 * resetea los no controlados al terminar la acción y tras un error se perdería
 * lo escrito. El error se oculta en cuanto se toca un campo.
 */

// ─── Botón: imprimir las etiquetas de un alta ───────────────────────────────────
export function PrintStockEntryLabelsButton({
  stockEntryId,
  count,
  size = "sm",
}: {
  stockEntryId: string;
  count: number;
  size?: "sm" | "md";
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    status?: string;
    message: string;
  } | null>(null);

  async function print(): Promise<void> {
    setPending(true);
    setFeedback(null);
    try {
      setFeedback(await printStockEntryLabelsAction(stockEntryId));
    } catch {
      setFeedback({
        ok: false,
        message: "No se pudieron imprimir las etiquetas. Inténtalo de nuevo.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={print}
        disabled={pending}
      >
        <Printer className="w-3.5 h-3.5" />
        {pending ? "Enviando…" : `Imprimir ${count} etiquetas`}
      </Button>
      {feedback && (
        <p
          className={
            !feedback.ok
              ? "flex items-center gap-1.5 text-xs text-[var(--color-status-rechazo)]"
              : feedback.status === "simulated"
                ? "flex items-center gap-1.5 text-xs text-[var(--color-warning)]"
                : "flex items-center gap-1.5 text-xs text-[var(--color-primary)]"
          }
        >
          {feedback.ok && feedback.status !== "simulated" ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {feedback.message}
        </p>
      )}
    </div>
  );
}

// ─── Diálogo: alta manual de sacas ──────────────────────────────────────────────
export function StockEntryDialog({
  materials,
  zones,
}: {
  materials: Option[];
  zones: Option[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [numSacks, setNumSacks] = useState("");
  const [weightPerSack, setWeightPerSack] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [showError, setShowError] = useState(false);
  // Tras crear el alta el diálogo se queda abierto para imprimir las etiquetas.
  const [created, setCreated] = useState<{
    id: string;
    numSacks: number;
    message: string;
  } | null>(null);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createStockEntryAction(prev, formData);
      setShowError(!result.ok);
      if (result.ok && result.stockEntryId) {
        setCreated({
          id: result.stockEntryId,
          numSacks: result.numSacks ?? 0,
          message: result.message ?? "",
        });
      }
      return result;
    },
    INITIAL,
  );

  const total = (Number(numSacks) || 0) * (Number(weightPerSack) || 0);

  function reset(): void {
    setMaterialId("");
    setZoneId("");
    setNumSacks("");
    setWeightPerSack("");
    setDate(today());
    setNotes("");
    setCreated(null);
    setShowError(false);
  }

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) reset();
  }

  function touch<T>(set: (v: T) => void): (v: T) => void {
    return (v: T) => {
      set(v);
      setShowError(false);
    };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PackagePlus className="w-4 h-4" /> Alta de sacas
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Alta manual de sacas"
        description="Crea sacas en almacén con su QR (stock inicial, material sin contenedor…)."
      >
        {created ? (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 text-sm text-[var(--color-primary)]">
              <Check className="w-4 h-4" /> {created.message}
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              Imprime ahora las etiquetas para pegarlas en las sacas. También
              puedes hacerlo más tarde desde el histórico de movimientos.
            </p>
            <PrintStockEntryLabelsButton
              stockEntryId={created.id}
              count={created.numSacks}
              size="md"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={reset}>
                Otra alta
              </Button>
              <DialogClose asChild>
                <Button type="button">Cerrar</Button>
              </DialogClose>
            </div>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <div>
              <Label htmlFor="sa-in-material">Producto</Label>
              <Select
                id="sa-in-material"
                name="materialId"
                required
                value={materialId}
                onChange={(e) => touch(setMaterialId)(e.target.value)}
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
              <Label htmlFor="sa-in-zone">Ubicación</Label>
              <Select
                id="sa-in-zone"
                name="zoneId"
                required
                value={zoneId}
                onChange={(e) => touch(setZoneId)(e.target.value)}
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sa-in-num">Nº de sacas</Label>
                <Input
                  id="sa-in-num"
                  name="numSacks"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={numSacks}
                  onChange={(e) => touch(setNumSacks)(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label htmlFor="sa-in-weight">Peso por saca (kg)</Label>
                <Input
                  id="sa-in-weight"
                  name="weightPerSack"
                  type="number"
                  min={0.01}
                  step="any"
                  required
                  value={weightPerSack}
                  onChange={(e) => touch(setWeightPerSack)(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            {total > 0 && (
              <p className="text-xs text-[var(--color-muted)]">
                Total: {total.toLocaleString("es-ES")} kg
              </p>
            )}
            <div>
              <Label htmlFor="sa-in-date">Fecha de alta</Label>
              <Input
                id="sa-in-date"
                name="date"
                type="date"
                required
                value={date}
                onChange={(e) => touch(setDate)(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sa-in-notes">Notas</Label>
              <Textarea
                id="sa-in-notes"
                name="notes"
                value={notes}
                onChange={(e) => touch(setNotes)(e.target.value)}
                placeholder="Stock inicial, BLs de origen…"
              />
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Se imprimen en la etiqueta de cada saca.
              </p>
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
              <SubmitButton pendingText="Creando sacas…">
                Dar de alta
              </SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Diálogo: baja manual de sacas ──────────────────────────────────────────────
export function StockExitDialog({
  materials,
  zones,
  availability,
}: {
  materials: Option[];
  zones: Option[];
  availability: AvailabilityRow[];
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [numSacks, setNumSacks] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [showError, setShowError] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createStockExitAction(prev, formData);
      setShowError(!result.ok);
      if (result.ok) {
        setOpen(false);
        setMaterialId("");
        setZoneId("");
        setNumSacks("");
        setDate(today());
        setNotes("");
      }
      return result;
    },
    INITIAL,
  );

  const rows = availability.filter((a) => a.materialId === materialId);
  const available = rows
    .filter((a) => !zoneId || a.zoneId === zoneId)
    .reduce((sum, a) => sum + a.count, 0);
  // Solo se ofrecen las ubicaciones donde hay sacas del producto elegido.
  const zonesWithStock = zones.filter((z) =>
    rows.some((a) => a.zoneId === z.id && a.count > 0),
  );
  const tooMany = materialId !== "" && (Number(numSacks) || 0) > available;

  function handleOpenChange(next: boolean): void {
    setOpen(next);
    if (!next) setShowError(false);
  }

  function touch<T>(set: (v: T) => void): (v: T) => void {
    return (v: T) => {
      set(v);
      setShowError(false);
    };
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PackageMinus className="w-4 h-4" /> Baja de sacas
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Baja manual de sacas"
        description="Saca del stock las sacas en almacén más antiguas del producto."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="sa-out-material">Producto</Label>
            <Select
              id="sa-out-material"
              name="materialId"
              required
              value={materialId}
              onChange={(e) => {
                touch(setMaterialId)(e.target.value);
                setZoneId("");
              }}
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
            <Label htmlFor="sa-out-zone">Ubicación</Label>
            <Select
              id="sa-out-zone"
              name="zoneId"
              value={zoneId}
              disabled={materialId === ""}
              onChange={(e) => touch(setZoneId)(e.target.value)}
            >
              <option value="">Cualquiera</option>
              {zonesWithStock.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="sa-out-num">Nº de sacas</Label>
            <Input
              id="sa-out-num"
              name="numSacks"
              type="number"
              min={1}
              max={materialId ? available : undefined}
              step={1}
              required
              value={numSacks}
              onChange={(e) => touch(setNumSacks)(e.target.value)}
              placeholder="0"
            />
            {materialId !== "" && (
              <p
                className={
                  tooMany
                    ? "mt-1 text-xs text-red-600"
                    : "mt-1 text-xs text-[var(--color-muted)]"
                }
              >
                {tooMany
                  ? `Solo hay ${available} sacas en almacén.`
                  : `En almacén: ${available} sacas`}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sa-out-date">Fecha de baja</Label>
            <Input
              id="sa-out-date"
              name="date"
              type="date"
              required
              value={date}
              onChange={(e) => touch(setDate)(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sa-out-notes">Notas</Label>
            <Textarea
              id="sa-out-notes"
              name="notes"
              value={notes}
              onChange={(e) => touch(setNotes)(e.target.value)}
              placeholder="Motivo de la baja…"
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
            <SubmitButton
              pendingText="Dando de baja…"
              disabled={tooMany || available === 0}
            >
              Dar de baja
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
