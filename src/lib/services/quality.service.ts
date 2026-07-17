import { prisma } from "@/lib/prisma";
import { type Prisma, type QualityResult } from "@prisma/client";
import {
  MEASURE_KEYS,
  type MeasureKey,
} from "@/app/(dashboard)/calidad/quality-thresholds";

/**
 * Servicio de Calidad — lógica de negocio sobre QualityRecord.
 *
 * Un registro de calidad evalúa un ProductionLot: material, proveedor (opc.),
 * turno y una rejilla de medidas (densidad + porcentajes de contaminantes).
 * El resultado es OK / NOK / PENDIENTE; forzar OK con parámetros fuera de rango
 * exige un `overrideReason`.
 */

export type QualityRecordWithRefs = Prisma.QualityRecordGetPayload<{
  include: { lot: true; material: true; supplier: true };
}>;

/** Listado de registros de calidad, más recientes primero. */
export function listQualityRecords(
  limit = 100,
): Promise<QualityRecordWithRefs[]> {
  return prisma.qualityRecord.findMany({
    include: { lot: true, material: true, supplier: true },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
}

export interface CreateQualityRecordInput {
  lotId: string;
  materialId: string;
  supplierId?: string;
  shift?: string;
  sampleType?: string;
  result: QualityResult;
  overrideReason?: string;
  density?: number;
  pvcPct?: number;
  gluePct?: number;
  multilayerPct?: number;
  metalPct?: number;
  otherPct?: number;
  notes?: string;
}

/** Crea un registro de calidad para un lote existente. */
export function createQualityRecord(
  input: CreateQualityRecordInput,
): Promise<QualityRecordWithRefs> {
  return prisma.qualityRecord.create({
    data: {
      lotId: input.lotId,
      materialId: input.materialId,
      supplierId: input.supplierId ?? null,
      shift: input.shift ?? null,
      sampleType: input.sampleType ?? null,
      result: input.result,
      overrideReason: input.overrideReason ?? null,
      density: input.density ?? null,
      pvcPct: input.pvcPct ?? null,
      gluePct: input.gluePct ?? null,
      multilayerPct: input.multilayerPct ?? null,
      metalPct: input.metalPct ?? null,
      otherPct: input.otherPct ?? null,
      notes: input.notes ?? null,
    },
    include: { lot: true, material: true, supplier: true },
  });
}

export interface UpdateQualityResultInput {
  id: string;
  result: QualityResult;
  overrideReason?: string;
}

/** Edita el resultado (OK/NOK/PENDIENTE) de un registro, con override opcional. */
export function updateQualityResult(
  input: UpdateQualityResultInput,
): Promise<QualityRecordWithRefs> {
  return prisma.qualityRecord.update({
    where: { id: input.id },
    data: {
      result: input.result,
      overrideReason: input.overrideReason ?? null,
    },
    include: { lot: true, material: true, supplier: true },
  });
}

/** Datos auxiliares para los formularios de calidad. */
export function getQualityFormData(): Promise<{
  lots: {
    id: string;
    lotNumber: string;
    materialId: string;
    materialName: string;
  }[];
  materials: { id: string; name: string; code: string }[];
  suppliers: { id: string; name: string; code: string }[];
}> {
  return Promise.all([
    prisma.productionLot.findMany({
      select: {
        id: true,
        lotNumber: true,
        materialId: true,
        material: { select: { name: true } },
      },
      orderBy: { producedAt: "desc" },
    }),
    prisma.material.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]).then(([lots, materials, suppliers]) => ({
    lots: lots.map((l) => ({
      id: l.id,
      lotNumber: l.lotNumber,
      materialId: l.materialId,
      materialName: l.material.name,
    })),
    materials,
    suppliers,
  }));
}

export interface QualityAverageGroup {
  supplierId: string | null;
  supplierName: string;
  materialId: string;
  materialName: string;
  count: number;
  averages: Record<MeasureKey, number | null>;
}

/** Filtros opcionales para acotar los promedios (proveedor, material, periodo). */
export interface QualityAverageFilters {
  supplierId?: string;
  materialId?: string;
  /** Inicio del periodo (inclusive). */
  from?: Date;
  /** Fin del periodo (exclusive). */
  to?: Date;
}

/**
 * Promedios de cada parámetro agrupados por proveedor y material, usando
 * agregación (`groupBy` + `_avg`) en Prisma. Admite filtrar por proveedor,
 * material y periodo (p.ej. "promedio de metal de Argelia este mes").
 */
export async function getQualityAverages(
  filters: QualityAverageFilters = {},
): Promise<QualityAverageGroup[]> {
  const where: Prisma.QualityRecordWhereInput = {};
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.materialId) where.materialId = filters.materialId;
  if (filters.from || filters.to) {
    where.recordedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lt: filters.to } : {}),
    };
  }

  const grouped = await prisma.qualityRecord.groupBy({
    by: ["supplierId", "materialId"],
    where,
    _count: { _all: true },
    _avg: {
      density: true,
      pvcPct: true,
      gluePct: true,
      multilayerPct: true,
      metalPct: true,
      otherPct: true,
    },
  });

  if (grouped.length === 0) return [];

  const materialIds = [...new Set(grouped.map((g) => g.materialId))];
  const supplierIds = grouped
    .map((g) => g.supplierId)
    .filter((id): id is string => id != null);

  const [materials, suppliers] = await Promise.all([
    prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, name: true },
    }),
    supplierIds.length
      ? prisma.supplier.findMany({
          where: { id: { in: [...new Set(supplierIds)] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);

  const materialName = new Map(materials.map((m) => [m.id, m.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return grouped
    .map((g): QualityAverageGroup => {
      const averages = MEASURE_KEYS.reduce(
        (acc, key) => {
          acc[key] = g._avg[key] ?? null;
          return acc;
        },
        {} as Record<MeasureKey, number | null>,
      );
      return {
        supplierId: g.supplierId,
        supplierName: g.supplierId
          ? (supplierName.get(g.supplierId) ?? "Proveedor desconocido")
          : "Sin proveedor",
        materialId: g.materialId,
        materialName: materialName.get(g.materialId) ?? "Material desconocido",
        count: g._count._all,
        averages,
      };
    })
    .sort(
      (a, b) =>
        a.supplierName.localeCompare(b.supplierName) ||
        a.materialName.localeCompare(b.materialName),
    );
}
