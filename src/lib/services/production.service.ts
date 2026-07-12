import { prisma } from "@/lib/prisma";
import { SackStatus, LotType, type Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { generateLotNumber } from "@/lib/utils";

/**
 * Servicio de Producción — lógica de negocio sobre Sack + ProductionLot +
 * Transformation.
 *
 * Flujo (naming validado con cliente):
 *  1. Entrada a tolva: se escanea/selecciona una saca EN_ALMACEN → pasa a
 *     EN_PRODUCCION y se registra como input de la transformación abierta del
 *     día (se reutiliza o se crea).
 *  2. Saca de salida (Producto Terminado / Subproducto / Rechazo): se crea una
 *     Sack nueva con el status correspondiente y se asocia a un lote del día
 *     (mismo tipo + material). Nº de lote autogenerado (DDMMYY-nº).
 *  3. Historial del día: sacas de salida generadas hoy, agrupadas por tipo.
 */

export type SackWithMaterialZone = Prisma.SackGetPayload<{
  include: { material: true; zone: true };
}>;

export type OutputSack = Prisma.SackGetPayload<{
  include: { material: true; lot: true };
}>;

/** Estados de saca de salida por tipo de lote. */
const OUTPUT_STATUS: Record<LotType, SackStatus> = {
  PRODUCTO_TERMINADO: SackStatus.PRODUCTO_TERMINADO,
  SUBPRODUCTO: SackStatus.SUBPRODUCTO,
  RECHAZO: SackStatus.RECHAZO,
};

const OUTPUT_STATUSES: SackStatus[] = [
  SackStatus.PRODUCTO_TERMINADO,
  SackStatus.SUBPRODUCTO,
  SackStatus.RECHAZO,
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ─── Consultas ─────────────────────────────────────────────────────────────────

/** Sacas EN_ALMACEN disponibles para entrar a tolva. */
export function listWarehouseSacks(
  limit = 100,
): Promise<SackWithMaterialZone[]> {
  return prisma.sack.findMany({
    where: { status: SackStatus.EN_ALMACEN },
    include: { material: true, zone: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/** Busca una saca por su QR (para el escáner). Solo sacas EN_ALMACEN. */
export function findWarehouseSackByQr(
  qrCode: string,
): Promise<SackWithMaterialZone | null> {
  return prisma.sack.findFirst({
    where: { qrCode, status: SackStatus.EN_ALMACEN },
    include: { material: true, zone: true },
  });
}

/** Sacas de salida (PT/Sub/Rechazo) generadas hoy. */
export function listTodayOutput(): Promise<OutputSack[]> {
  return prisma.sack.findMany({
    where: {
      status: { in: OUTPUT_STATUSES },
      createdAt: { gte: startOfToday() },
    },
    include: { material: true, lot: true },
    orderBy: { createdAt: "desc" },
  });
}

export interface ProductionStats {
  inProduction: number;
  ptToday: number;
  kgProcessed: number;
}

/** KPIs para las StatCards. */
export async function getProductionStats(): Promise<ProductionStats> {
  const start = startOfToday();
  const [inProduction, ptToday, processedInputs] = await Promise.all([
    prisma.sack.count({ where: { status: SackStatus.EN_PRODUCCION } }),
    prisma.sack.count({
      where: {
        status: SackStatus.PRODUCTO_TERMINADO,
        createdAt: { gte: start },
      },
    }),
    prisma.transformationInput.findMany({
      where: { enteredAt: { gte: start } },
      select: { sack: { select: { weight: true } } },
    }),
  ]);

  const kgProcessed = processedInputs.reduce(
    (sum, i) => sum + i.sack.weight,
    0,
  );
  return { inProduction, ptToday, kgProcessed };
}

/** Datos auxiliares para los formularios de producción. */
export function getProductionFormData(): Promise<{
  materials: { id: string; name: string; code: string }[];
  zones: { id: string; name: string; code: string; warehouseName: string }[];
}> {
  return Promise.all([
    prisma.material.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.zone.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        warehouse: { select: { name: true } },
      },
      orderBy: { code: "asc" },
    }),
  ]).then(([materials, zones]) => ({
    materials,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      warehouseName: z.warehouse.name,
    })),
  }));
}

// ─── Helpers transaccionales ─────────────────────────────────────────────────────

type Tx = Prisma.TransactionClient;

/**
 * Reutiliza el lote del día (mismo tipo + material) o lo crea con nº autogenerado.
 * El nº secuencial es el total de lotes del día + 1 → único por día.
 */
async function getOrCreateDailyLot(
  tx: Tx,
  type: LotType,
  materialId: string,
): Promise<Prisma.ProductionLotGetPayload<Record<string, never>>> {
  const start = startOfToday();
  const existing = await tx.productionLot.findFirst({
    where: { type, materialId, producedAt: { gte: start } },
    orderBy: { producedAt: "desc" },
  });
  if (existing) return existing;

  const countToday = await tx.productionLot.count({
    where: { producedAt: { gte: start } },
  });
  const lotNumber = generateLotNumber(new Date(), countToday + 1);
  return tx.productionLot.create({ data: { lotNumber, type, materialId } });
}

/** Reutiliza la transformación abierta del día o crea una nueva. */
async function getOrCreateOpenTransformation(
  tx: Tx,
  materialId: string,
  operatorId?: string,
): Promise<string> {
  const start = startOfToday();
  const open = await tx.transformation.findFirst({
    where: { endedAt: null, startedAt: { gte: start } },
    orderBy: { startedAt: "desc" },
  });
  if (open) return open.id;

  const lot = await getOrCreateDailyLot(
    tx,
    LotType.PRODUCTO_TERMINADO,
    materialId,
  );
  const created = await tx.transformation.create({
    data: { lotId: lot.id, operatorId: operatorId ?? null },
  });
  return created.id;
}

// ─── Mutaciones ─────────────────────────────────────────────────────────────────

/**
 * Entrada a tolva: la saca pasa a EN_PRODUCCION y se registra como input de la
 * transformación abierta del día (transaccional).
 */
export async function enterHopper(
  sackId: string,
  operatorId?: string,
): Promise<{ qrCode: string }> {
  const sack = await prisma.sack.findUniqueOrThrow({ where: { id: sackId } });
  if (sack.status !== SackStatus.EN_ALMACEN) {
    throw new Error("La saca debe estar en almacén para entrar a tolva.");
  }

  return prisma.$transaction(async (tx) => {
    const transformationId = await getOrCreateOpenTransformation(
      tx,
      sack.materialId,
      operatorId,
    );
    await tx.sack.update({
      where: { id: sack.id },
      data: { status: SackStatus.EN_PRODUCCION },
    });
    await tx.transformationInput.create({
      data: { transformationId, sackId: sack.id },
    });
    return { qrCode: sack.qrCode };
  });
}

export interface CreateOutputSackInput {
  type: LotType;
  materialId: string;
  weight: number;
  zoneId?: string;
  notes?: string;
}

/**
 * Crea una saca de salida (Producto Terminado / Subproducto / Rechazo) y la
 * asocia al lote del día correspondiente (transaccional). El nº de lote se
 * autogenera; para PT se acumula en el lote PT del día del mismo material.
 */
export async function createOutputSack(
  input: CreateOutputSackInput,
): Promise<{ qrCode: string; lotNumber: string }> {
  if (input.weight <= 0) {
    throw new Error("El peso debe ser mayor que 0.");
  }

  return prisma.$transaction(async (tx) => {
    const lot = await getOrCreateDailyLot(tx, input.type, input.materialId);
    const sack = await tx.sack.create({
      data: {
        qrCode: `SACK-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: OUTPUT_STATUS[input.type],
        weight: input.weight,
        materialId: input.materialId,
        zoneId: input.zoneId ?? null,
        lotId: lot.id,
        notes: input.notes ?? null,
      },
    });
    return { qrCode: sack.qrCode, lotNumber: lot.lotNumber };
  });
}
