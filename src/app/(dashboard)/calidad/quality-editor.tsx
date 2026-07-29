"use client";

import { useActionState, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Save,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createRecordAction,
  saveRecordAction,
  deleteRecordAction,
  type ActionState,
} from "./actions";
import {
  SHIFTS,
  SAMPLE_MEASURE_KEYS,
  SAMPLE_MEASURE_LABELS,
  SAMPLE_MEASURE_UNITS,
  SAMPLES_PER_RECORD,
  densityStatus,
  type DensityRange,
  type SampleMeasureKey,
  type SampleStatus,
} from "./quality-thresholds";

const INITIAL: ActionState = { ok: false };

// ─── Diálogo: nuevo registro ─────────────────────────────────────────────────────

export function NewRecordDialog(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await createRecordAction(prev, formData);
      if (res.ok) setOpen(false);
      return res;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4" /> Nuevo Registro
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Nuevo registro de calidad"
        description="Registra la cabecera; las muestras se añaden después al editar."
      >
        <form action={action} className="space-y-4">
          <div>
            <Label htmlFor="date">Fecha</Label>
            <Input id="date" name="date" type="date" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="shift">Turno</Label>
              <Select id="shift" name="shift" defaultValue="">
                <option value="">Sin definir</option>
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="client">Cliente</Label>
              <Input id="client" name="client" placeholder="Opcional" />
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Observaciones</Label>
            <Textarea id="notes" name="notes" />
          </div>
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>Crear registro</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Editor de 20 muestras ───────────────────────────────────────────────────────

export interface EditorSampleData {
  index: number;
  density: number | null;
  pvc: number | null;
  cola: number | null;
  multicapas: number | null;
  metal: number | null;
  otros: number | null;
  comment: string | null;
}

export interface EditorRecordData {
  id: string;
  dateLabel: string;
  shift: string | null;
  client: string | null;
  notes: string | null;
  samples: EditorSampleData[];
}

type RowState = Record<SampleMeasureKey, string> & {
  index: number;
  comment: string;
};

function buildRows(samples: EditorSampleData[]): RowState[] {
  const byIndex = new Map(samples.map((s) => [s.index, s]));
  const numStr = (n: number | null): string => (n == null ? "" : String(n));
  const rows: RowState[] = [];
  for (let i = 1; i <= SAMPLES_PER_RECORD; i++) {
    const s = byIndex.get(i);
    rows.push({
      index: i,
      density: numStr(s?.density ?? null),
      pvc: numStr(s?.pvc ?? null),
      cola: numStr(s?.cola ?? null),
      multicapas: numStr(s?.multicapas ?? null),
      metal: numStr(s?.metal ?? null),
      otros: numStr(s?.otros ?? null),
      comment: s?.comment ?? "",
    });
  }
  return rows;
}

function parseNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function StatusPill({ status }: { status: SampleStatus }): React.JSX.Element {
  if (status === "OK")
    return (
      <Badge tone="green">
        <CheckCircle2 className="w-3 h-3" /> OK
      </Badge>
    );
  if (status === "NOK")
    return (
      <Badge tone="red">
        <XCircle className="w-3 h-3" /> NOK
      </Badge>
    );
  return <Badge tone="gray">—</Badge>;
}

export function SampleEditorDialog({
  record,
  range,
}: {
  record: EditorRecordData;
  range: DensityRange;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<RowState[]>(() => buildRows(record.samples));
  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const res = await saveRecordAction(prev, formData);
      if (res.ok) setOpen(false);
      return res;
    },
    INITIAL,
  );

  function setCell(idx: number, field: keyof RowState, value: string): void {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  const averages = useMemo(() => {
    return SAMPLE_MEASURE_KEYS.reduce(
      (acc, key) => {
        const vals = rows
          .map((r) => parseNum(r[key]))
          .filter((n): n is number => n != null);
        acc[key] = vals.length
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : null;
        return acc;
      },
      {} as Record<SampleMeasureKey, number | null>,
    );
  }, [rows]);

  const samplesJson = useMemo(
    () =>
      JSON.stringify(
        rows.map((r) => ({
          index: r.index,
          density: parseNum(r.density),
          pvc: parseNum(r.pvc),
          cola: parseNum(r.cola),
          multicapas: parseNum(r.multicapas),
          metal: parseNum(r.metal),
          otros: parseNum(r.otros),
          comment: r.comment.trim() === "" ? null : r.comment,
        })),
      ),
    [rows],
  );

  const measuredCount = rows.filter((r) => parseNum(r.density) != null).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="w-3.5 h-3.5" /> Editar
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-5xl"
        title={`Editar Registro · ${record.dateLabel}`}
        description={`Estado OK si densidad ${range.min}–${range.max} g. Hasta 20 muestras.`}
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={record.id} />
          <input type="hidden" name="samples" value={samplesJson} />

          {/* Cabecera */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="edit-shift">Turno</Label>
              <Select
                id="edit-shift"
                name="shift"
                defaultValue={record.shift ?? ""}
              >
                <option value="">Sin definir</option>
                {SHIFTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-client">Cliente</Label>
              <Input
                id="edit-client"
                name="client"
                defaultValue={record.client ?? ""}
              />
            </div>
            <div>
              <Label htmlFor="edit-notes">Observaciones</Label>
              <Input
                id="edit-notes"
                name="notes"
                defaultValue={record.notes ?? ""}
              />
            </div>
          </div>

          {/* Promedios en vivo */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-hover)] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Promedios del registro
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                Muestras: {measuredCount}
              </span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {SAMPLE_MEASURE_KEYS.map((key) => (
                <div
                  key={key}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                >
                  <p className="text-xs text-[var(--color-muted)]">
                    {SAMPLE_MEASURE_LABELS[key]}
                  </p>
                  <p className="text-base font-semibold tabular-nums">
                    {averages[key] == null ? "—" : averages[key]!.toFixed(2)}
                    <span className="text-xs font-normal text-[var(--color-muted)]">
                      {SAMPLE_MEASURE_UNITS[key]}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Rejilla de 20 muestras */}
          <div className="max-h-[45vh] overflow-auto rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-hover)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-2 text-center text-xs font-medium">
                    #
                  </th>
                  {SAMPLE_MEASURE_KEYS.map((key) => (
                    <th
                      key={key}
                      className="px-2 py-2 text-left text-xs font-medium whitespace-nowrap"
                    >
                      {SAMPLE_MEASURE_LABELS[key]}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center text-xs font-medium">
                    Estado
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium">
                    Comentario
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const status = densityStatus(parseNum(row.density), range);
                  return (
                    <tr
                      key={row.index}
                      className="border-t border-[var(--color-border)]"
                    >
                      <td className="px-2 py-1 text-center font-mono text-xs text-[var(--color-muted)]">
                        {row.index}
                      </td>
                      {SAMPLE_MEASURE_KEYS.map((key) => (
                        <td key={key} className="px-1 py-1">
                          <Input
                            type="number"
                            step="0.01"
                            inputMode="decimal"
                            className="h-8 text-xs"
                            value={row[key]}
                            onChange={(e) => setCell(idx, key, e.target.value)}
                            aria-label={`${SAMPLE_MEASURE_LABELS[key]} muestra ${row.index}`}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1 text-center">
                        <StatusPill status={status} />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          className="h-8 text-xs"
                          value={row.comment}
                          onChange={(e) =>
                            setCell(idx, "comment", e.target.value)
                          }
                          aria-label={`Comentario muestra ${row.index}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>
              <Save className="w-4 h-4" /> Guardar
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Botón: eliminar registro ────────────────────────────────────────────────────

export function DeleteRecordButton({ id }: { id: string }): React.JSX.Element {
  const [, action] = useActionState(deleteRecordAction, INITIAL);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("¿Eliminar este registro de calidad?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="text-red-600 hover:text-red-700"
        aria-label="Eliminar registro"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </form>
  );
}
