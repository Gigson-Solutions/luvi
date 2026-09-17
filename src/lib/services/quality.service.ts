import { prisma } from "@/lib/prisma";
import { QualityResult, type Prisma } from "@prisma/client";
import { getConfig } from "@/lib/services/config.service";
import {
  DEFAULT_DENSITY_RANGE,
  DEFAULT_QUALITY_RANGES,
  SAMPLE_MEASURE_KEYS,
  SAMPLES_PER_RECORD,
  sampleStatus,
  type DensityRange,
  type ParamRange,
  type QualityRanges,
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
  include: { samples: true; material: { select: { id: true; name: true } } };
}>;

// ─── Configuración de rangos ────────────────────────────────────────────────────

/**
 * Rangos min/max de todos los parámetros de calidad; lee `config.quality_ranges`
 * y fusiona con los defaults (cada parámetro ausente cae a su valor por defecto).
 */
export async function getQualityRanges(): Promise<QualityRanges> {
  const stored = await getConfig<Partial<Record<string, Partial<ParamRange>>>>(
    "quality_ranges",
    {},
  );
  const result = {} as QualityRanges;
  for (const key of SAMPLE_MEASURE_KEYS) {
    const fallback = DEFAULT_QUALITY_RANGES[key];
    const s = stored[key];
    result[key] = {
      min: typeof s?.min === "number" ? s.min : fallback.min,
      max: typeof s?.max === "number" ? s.max : fallback.max,
    };
  }
  return result;
}

/**
 * Rango de densidad OK; deriva de `config.quality_ranges` con fallback a los
 * defaults validados (330–370 g). API estable para el control de calidad.
 */
export async function getDensityRange(): Promise<DensityRange> {
  const { density } = await getQualityRanges();
  return {
    min: density.min ?? DEFAULT_DENSITY_RANGE.min,
    max: density.max ?? DEFAULT_DENSITY_RANGE.max,
  };
}

// ─── Conjuntos de rangos por producto o categoría ───────────────────────────────

export interface QualityRangeSetSummary {
  id: string;
  name: string;
  active: boolean;
  ranges: QualityRanges;
  /** Productos y categorías que lo tienen asignado (para la tabla de config). */
  materialNames: string[];
  categoryNames: string[];
  materialIds: string[];
  categoryIds: string[];
}

/** Normaliza un `ranges` guardado en JSON al shape completo de QualityRanges. */
function toQualityRanges(raw: unknown): QualityRanges {
  const stored = (raw ?? {}) as Partial<Record<string, Partial<ParamRange>>>;
  const result = {} as QualityRanges;
  for (const key of SAMPLE_MEASURE_KEYS) {
    const s = stored[key];
    result[key] = {
      min: typeof s?.min === "number" ? s.min : null,
      max: typeof s?.max === "number" ? s.max : null,
    };
  }
  return result;
}

/** Conjuntos de rangos con los productos/categorías que los usan. */
export async function listQualityRangeSets(): Promise<
  QualityRangeSetSummary[]
> {
  const sets = await prisma.qualityRangeSet.findMany({
    orderBy: { name: "asc" },
    include: {
      materials: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      categories: {
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
  });
  return sets.map((s) => ({
    id: s.id,
    name: s.name,
    active: s.active,
    ranges: toQualityRanges(s.ranges),
    materialNames: s.materials.map((m) => m.name),
    categoryNames: s.categories.map((c) => c.name),
    materialIds: s.materials.map((m) => m.id),
    categoryIds: s.categories.map((c) => c.id),
  }));
}

export interface SaveQualityRangeSetInput {
  id?: string;
  /** Vacío → se nombra como los productos/tipos seleccionados. */
  name: string;
  active?: boolean;
  ranges: QualityRanges;
  /**
   * Productos y tipos de material (ya existentes) a los que se aplica. Si se
   * indican, sustituyen la asignación anterior del conjunto; un producto o tipo
   * que tuviera otro conjunto pasa a este.
   */
  materialIds?: string[];
  categoryIds?: string[];
}

/** Crea o actualiza un conjunto de rangos y, si se indica, a qué se aplica. */
export async function saveQualityRangeSet(
  input: SaveQualityRangeSetInput,
): Promise<{ id: string; name: string }> {
  const name = input.name.trim() || (await nameFromSelection(input));
  if (!name) {
    throw new Error(
      "Selecciona al menos un material o tipo de material existente",
    );
  }
  const duplicate = await prisma.qualityRangeSet.findFirst({
    where: { name, ...(input.id ? { id: { not: input.id } } : {}) },
    select: { id: true },
  });
  if (duplicate) throw new Error(`Ya existe un conjunto llamado "${name}"`);

  const data = {
    name,
    active: input.active ?? true,
    ranges: input.ranges as unknown as Prisma.InputJsonValue,
  };
  return prisma.$transaction(async (tx) => {
    const set = input.id
      ? await tx.qualityRangeSet.update({ where: { id: input.id }, data })
      : await tx.qualityRangeSet.create({ data });

    if (input.materialIds) {
      await tx.material.updateMany({
        where: { qualityRangeSetId: set.id, id: { notIn: input.materialIds } },
        data: { qualityRangeSetId: null },
      });
      await tx.material.updateMany({
        where: { id: { in: input.materialIds } },
        data: { qualityRangeSetId: set.id },
      });
    }
    if (input.categoryIds) {
      await tx.materialCategory.updateMany({
        where: { qualityRangeSetId: set.id, id: { notIn: input.categoryIds } },
        data: { qualityRangeSetId: null },
      });
      await tx.materialCategory.updateMany({
        where: { id: { in: input.categoryIds } },
        data: { qualityRangeSetId: set.id },
      });
    }
    return { id: set.id, name: set.name };
  });
}

/** Nombre por defecto de un conjunto: los tipos y productos a los que se aplica. */
async function nameFromSelection(
  input: SaveQualityRangeSetInput,
): Promise<string> {
  const [categories, materials] = await Promise.all([
    prisma.materialCategory.findMany({
      where: { id: { in: input.categoryIds ?? [] } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { id: { in: input.materialIds ?? [] } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return [...categories, ...materials].map((x) => x.name).join(", ");
}

/** Borra un conjunto; los productos/categorías que lo usaban quedan sin él. */
export async function deleteQualityRangeSet(id: string): Promise<void> {
  await prisma.$transaction([
    prisma.material.updateMany({
      where: { qualityRangeSetId: id },
      data: { qualityRangeSetId: null },
    }),
    prisma.materialCategory.updateMany({
      where: { qualityRangeSetId: id },
      data: { qualityRangeSetId: null },
    }),
    prisma.qualityRangeSet.delete({ where: { id } }),
  ]);
}

/**
 * Rangos aplicables a un análisis del producto indicado. Orden de resolución:
 * conjunto del producto → conjunto de su categoría → rangos generales. Un
 * parámetro sin límites en el conjunto elegido cae al valor general.
 */
export async function resolveQualityRanges(
  materialId?: string | null,
): Promise<QualityRanges> {
  const general = await getQualityRanges();
  if (!materialId) return general;

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: {
      qualityRangeSet: { select: { ranges: true, active: true } },
      category: {
        select: { qualityRangeSet: { select: { ranges: true, active: true } } },
      },
    },
  });
  const set =
    (material?.qualityRangeSet?.active ? material.qualityRangeSet : null) ??
    (material?.category?.qualityRangeSet?.active
      ? material.category.qualityRangeSet
      : null);
  if (!set) return general;

  const own = toQualityRanges(set.ranges);
  const merged = {} as QualityRanges;
  for (const key of SAMPLE_MEASURE_KEYS) {
    const o = own[key];
    merged[key] = o.min == null && o.max == null ? general[key] : { ...o };
  }
  return merged;
}

/**
 * Rangos resueltos de todos los productos de una tacada: el editor de calidad
 * los precarga para poder recalcular OK/NOK al cambiar de producto sin ir al
 * servidor.
 */
export async function resolveAllMaterialRanges(): Promise<
  Record<string, QualityRanges>
> {
  const general = await getQualityRanges();
  const materials = await prisma.material.findMany({
    select: {
      id: true,
      qualityRangeSet: { select: { ranges: true, active: true } },
      category: {
        select: { qualityRangeSet: { select: { ranges: true, active: true } } },
      },
    },
  });

  const result: Record<string, QualityRanges> = {};
  for (const m of materials) {
    const set =
      (m.qualityRangeSet?.active ? m.qualityRangeSet : null) ??
      (m.category?.qualityRangeSet?.active ? m.category.qualityRangeSet : null);
    if (!set) {
      result[m.id] = general;
      continue;
    }
    const own = toQualityRanges(set.ranges);
    const merged = {} as QualityRanges;
    for (const key of SAMPLE_MEASURE_KEYS) {
      const o = own[key];
      merged[key] = o.min == null && o.max == null ? general[key] : { ...o };
    }
    result[m.id] = merged;
  }
  return result;
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
  materialId: string | null;
  materialName: string | null;
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
    materialId: record.materialId,
    materialName: record.material?.name ?? null,
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
    include: {
      samples: { orderBy: { index: "asc" } },
      material: { select: { id: true, name: true } },
    },
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
  /** Producto analizado; determina los rangos de calidad aplicados. */
  materialId?: string;
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
      materialId: input.materialId || null,
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
  materialId?: string;
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
  // Los rangos salen del producto analizado (o de su categoría); sin producto,
  // de los rangos generales.
  const ranges = await resolveQualityRanges(input.materialId);
  const rows = input.samples.filter(hasData).map((s) => ({
    index: s.index,
    density: s.density,
    pvc: s.pvc,
    cola: s.cola,
    multicapas: s.multicapas,
    metal: s.metal,
    otros: s.otros,
    status: sampleStatus(s, ranges),
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
        materialId: input.materialId || null,
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
