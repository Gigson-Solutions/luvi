import { prisma } from "@/lib/prisma";
import { QualityResult, type Prisma } from "@prisma/client";
import {
  DEFAULT_DENSITY_RANGE,
  SAMPLES_PER_RECORD,
  densityStatus,
  type DensityRange,
  type SampleStatus,
} from "@/app/(dashboard)/calidad/quality-thresholds";

/**
 * Servicio de Calidad — hoja de muestras por registro.
 *
 * Cada QualityRecord es un registro diario (fecha · turno · cliente) con hasta
 * 20 muestras. El estado OK/NOK de cada muestra se deriva de su densidad y del
 * rango configurable (`config.quality_ranges`, por defecto 330–370 g). El
 * `result` del registro es el estado agregado de sus muestras.
 */

export type QualityRecordWithSamples = Prisma.QualityRecordGetPayload<{
  include: { samples: true };
}>;

// ─── Configuración de rangos ────────────────────────────────────────────────────

/** Rango de densidad OK; lee `config.quality_ranges` con fallback a defaults. */
export async function getDensityRange(): Promise<DensityRange> {
  const row = await prisma.config.findUnique({
    where: { key: "quality_ranges" },
  });
  const v = row?.value as { densityMin?: number; densityMax?: number } | null;
  if (
    v &&
    typeof v.densityMin === "number" &&
    typeof v.densityMax === "number"
  ) {
    return { min: v.densityMin, max: v.densityMax };
  }
  return { ...DEFAULT_DENSITY_RANGE };
}

// ─── Utilidades de rango temporal ────────────────────────────────────────────────

/** Rango [from, to) del mes indicado (month 1..12). */
export function monthBounds(
  year: number,
  month: number,
): { from: Date; to: Date } {
  return { from: new Date(year, month - 1, 1), to: new Date(year, month, 1) };
}

// ─── Derivados de un registro ────────────────────────────────────────────────────

type SampleLike = { density: number | null; status: string | null };

/** Muestras con densidad medida. */
function measuredSamples<T extends SampleLike>(samples: T[]): T[] {
  return samples.filter((s) => s.density != null);
}

/** Estado agregado de un registro a partir de sus muestras. */
export function recordStatus(samples: SampleLike[]): SampleStatus {
  const measured = measuredSamples(samples);
  if (measured.length === 0) return "PENDIENTE";
  if (measured.some((s) => s.status === "NOK")) return "NOK";
  if (measured.every((s) => s.status === "OK")) return "OK";
  return "PENDIENTE";
}

/** Media de densidad de las muestras medidas, o null si no hay ninguna. */
export function averageDensity(samples: SampleLike[]): number | null {
  const values = measuredSamples(samples).map((s) => s.density as number);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface RecordSummary {
  id: string;
  date: Date | null;
  shift: string | null;
  client: string | null;
  notes: string | null;
  sampleCount: number;
  avgDensity: number | null;
  status: SampleStatus;
}

/** Resumen de fila para la tabla mensual. */
export function toRecordSummary(
  record: QualityRecordWithSamples,
): RecordSummary {
  return {
    id: record.id,
    date: record.date,
    shift: record.shift,
    client: record.client,
    notes: record.notes,
    sampleCount: measuredSamples(record.samples).length,
    avgDensity: averageDensity(record.samples),
    status: recordStatus(record.samples),
  };
}

// ─── Listado y estadísticas mensuales ────────────────────────────────────────────

/** Registros del mes (con muestras), más antiguos primero. */
export function listMonthlyRecords(
  year: number,
  month: number,
): Promise<QualityRecordWithSamples[]> {
  const { from, to } = monthBounds(year, month);
  return prisma.qualityRecord.findMany({
    where: { date: { gte: from, lt: to } },
    include: { samples: { orderBy: { index: "asc" } } },
    orderBy: { date: "asc" },
  });
}

export interface MonthlyStats {
  totalRecords: number;
  totalSamples: number;
  avgDensity: number | null;
  nokDays: number;
}

/** KPIs del mes: registros, muestras, densidad promedio y días con NOK. */
export async function getMonthlyStats(
  year: number,
  month: number,
): Promise<MonthlyStats> {
  const records = await listMonthlyRecords(year, month);
  const allSamples = records.flatMap((r) => r.samples);
  const nokDays = new Set(
    records
      .filter((r) => recordStatus(r.samples) === "NOK" && r.date)
      .map((r) => (r.date as Date).toDateString()),
  );
  return {
    totalRecords: records.length,
    totalSamples: measuredSamples(allSamples).length,
    avgDensity: averageDensity(allSamples),
    nokDays: nokDays.size,
  };
}

// ─── Registro individual + 20 muestras ───────────────────────────────────────────

export interface EditorSample {
  index: number;
  density: number | null;
  pvc: number | null;
  cola: number | null;
  multicapas: number | null;
  metal: number | null;
  otros: number | null;
  status: SampleStatus;
  comment: string | null;
}

export interface RecordDetail {
  id: string;
  date: Date | null;
  shift: string | null;
  client: string | null;
  notes: string | null;
  samples: EditorSample[];
}

function emptySample(index: number): EditorSample {
  return {
    index,
    density: null,
    pvc: null,
    cola: null,
    multicapas: null,
    metal: null,
    otros: null,
    status: "PENDIENTE",
    comment: null,
  };
}

/** Registro con exactamente 20 muestras (huecos rellenados con muestras vacías). */
export async function getRecordDetail(
  id: string,
): Promise<RecordDetail | null> {
  const record = await prisma.qualityRecord.findUnique({
    where: { id },
    include: { samples: true },
  });
  if (!record) return null;

  const byIndex = new Map(record.samples.map((s) => [s.index, s]));
  const samples: EditorSample[] = [];
  for (let i = 1; i <= SAMPLES_PER_RECORD; i++) {
    const s = byIndex.get(i);
    samples.push(
      s
        ? {
            index: i,
            density: s.density,
            pvc: s.pvc,
            cola: s.cola,
            multicapas: s.multicapas,
            metal: s.metal,
            otros: s.otros,
            status: (s.status as SampleStatus) ?? "PENDIENTE",
            comment: s.comment,
          }
        : emptySample(i),
    );
  }
  return {
    id: record.id,
    date: record.date,
    shift: record.shift,
    client: record.client,
    notes: record.notes,
    samples,
  };
}

// ─── Mutaciones ──────────────────────────────────────────────────────────────────

export interface CreateRecordInput {
  date: Date;
  shift?: string;
  client?: string;
  notes?: string;
}

/** Crea un registro diario vacío (sin muestras todavía). */
export function createRecord(
  input: CreateRecordInput,
): Promise<{ id: string }> {
  return prisma.qualityRecord.create({
    data: {
      date: input.date,
      shift: input.shift ?? null,
      client: input.client ?? null,
      notes: input.notes ?? null,
      result: QualityResult.PENDIENTE,
    },
    select: { id: true },
  });
}

export interface SampleInput {
  index: number;
  density: number | null;
  pvc: number | null;
  cola: number | null;
  multicapas: number | null;
  metal: number | null;
  otros: number | null;
  comment: string | null;
}

export interface SaveRecordInput {
  id: string;
  shift?: string;
  client?: string;
  notes?: string;
  samples: SampleInput[];
}

function hasData(s: SampleInput): boolean {
  return (
    s.density != null ||
    s.pvc != null ||
    s.cola != null ||
    s.multicapas != null ||
    s.metal != null ||
    s.otros != null ||
    (s.comment != null && s.comment.trim() !== "")
  );
}

/** Reemplaza cabecera + muestras del registro y recalcula su estado. */
export async function saveRecord(
  input: SaveRecordInput,
): Promise<{ id: string }> {
  const range = await getDensityRange();
  const rows = input.samples.filter(hasData).map((s) => ({
    index: s.index,
    density: s.density,
    pvc: s.pvc,
    cola: s.cola,
    multicapas: s.multicapas,
    metal: s.metal,
    otros: s.otros,
    status: densityStatus(s.density, range),
    comment: s.comment?.trim() || null,
  }));
  const result = recordStatus(rows) as QualityResult;

  await prisma.$transaction([
    prisma.qualitySample.deleteMany({ where: { recordId: input.id } }),
    prisma.qualityRecord.update({
      where: { id: input.id },
      data: {
        shift: input.shift ?? null,
        client: input.client ?? null,
        notes: input.notes ?? null,
        result,
        ...(rows.length > 0 ? { samples: { createMany: { data: rows } } } : {}),
      },
    }),
  ]);
  return { id: input.id };
}

/** Borra un registro y sus muestras (cascade). */
export async function deleteRecord(id: string): Promise<void> {
  await prisma.qualityRecord.delete({ where: { id } });
}
