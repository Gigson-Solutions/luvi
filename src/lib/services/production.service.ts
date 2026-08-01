import { prisma } from "@/lib/prisma";
import { SackStatus, LotType, MaterialKind, type Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { generateLotNumber } from "@/lib/utils";
import { getMaterialsByKind } from "@/lib/services/material.service";

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
  include: {
    material: true;
    lot: true;
    composedOf: { include: { inputSack: { include: { material: true } } } };
  };
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

/** GL-36: nº máximo de sacas de salida por lote. Al alcanzarlo, el lote se cierra. */
export const MAX_SACKS_PER_LOT = 22;

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

/** Sacas EN_PRODUCCION actualmente dentro de la tolva (mismo shape que
 * listWarehouseSacks: material + zona). */
/** Saca en la tolva con su hora de entrada (GL-47). */
export interface HopperSack {
  id: string;
  qrCode: string;
  weight: number;
  status: SackStatus;
  material: { name: string };
  zone: { name: string } | null;
  /** Hora en que la saca entró a la tolva (última entrada). */
  enteredHopperAt: Date | null;
}

/**
 * Sacas en la tolva (EN_PRODUCCION). GL-47: la última en entrar se muestra
 * ARRIBA (orden por hora de entrada descendente) y se registra esa hora.
 */
export async function listHopperSacks(limit = 100): Promise<HopperSack[]> {
  const sacks = await prisma.sack.findMany({
    where: { status: SackStatus.EN_PRODUCCION },
    include: {
      material: { select: { name: true } },
      zone: { select: { name: true } },
      transformationInputs: {
        orderBy: { enteredAt: "desc" },
        take: 1,
        select: { enteredAt: true },
      },
    },
    take: limit,
  });
  return sacks
    .map((s) => ({
      id: s.id,
      qrCode: s.qrCode,
      weight: s.weight,
      status: s.status,
      material: { name: s.material.name },
      zone: s.zone ? { name: s.zone.name } : null,
      enteredHopperAt: s.transformationInputs[0]?.enteredAt ?? null,
    }))
    .sort(
      (a, b) =>
        (b.enteredHopperAt?.getTime() ?? 0) -
        (a.enteredHopperAt?.getTime() ?? 0),
    );
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
    include: {
      material: true,
      lot: true,
      composedOf: {
        include: { inputSack: { include: { material: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Sacas de salida de un tipo concreto (Producto Terminado / Subproducto /
 * Rechazo), todas las creadas (no solo las de hoy). Para las pestañas.
 */
export function listOutputSacksByType(
  type: LotType,
  limit = 100,
): Promise<OutputSack[]> {
  return prisma.sack.findMany({
    where: { status: OUTPUT_STATUS[type] },
    include: {
      material: true,
      lot: true,
      composedOf: {
        include: { inputSack: { include: { material: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Nº total de sacas de salida por tipo (para los contadores de las pestañas). */
export async function getOutputCounts(): Promise<Record<LotType, number>> {
  const grouped = await prisma.sack.groupBy({
    by: ["status"],
    where: { status: { in: OUTPUT_STATUSES } },
    _count: { _all: true },
  });
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  return {
    [LotType.PRODUCTO_TERMINADO]:
      byStatus.get(SackStatus.PRODUCTO_TERMINADO) ?? 0,
    [LotType.SUBPRODUCTO]: byStatus.get(SackStatus.SUBPRODUCTO) ?? 0,
    [LotType.RECHAZO]: byStatus.get(SackStatus.RECHAZO) ?? 0,
  };
}

export interface ProductionStats {
  inProduction: number;
  ptToday: number;
  subToday: number;
  rechazoToday: number;
  kgProcessed: number;
}

/** KPIs para las StatCards. */
export async function getProductionStats(): Promise<ProductionStats> {
  const start = startOfToday();
  const countTodayByStatus = (status: SackStatus): Promise<number> =>
    prisma.sack.count({ where: { status, createdAt: { gte: start } } });

  const [inProduction, ptToday, subToday, rechazoToday, processedInputs] =
    await Promise.all([
      prisma.sack.count({ where: { status: SackStatus.EN_PRODUCCION } }),
      countTodayByStatus(SackStatus.PRODUCTO_TERMINADO),
      countTodayByStatus(SackStatus.SUBPRODUCTO),
      countTodayByStatus(SackStatus.RECHAZO),
      prisma.transformationInput.findMany({
        where: { enteredAt: { gte: start } },
        select: { sack: { select: { weight: true } } },
      }),
    ]);

  const kgProcessed = processedInputs.reduce(
    (sum, i) => sum + i.sack.weight,
    0,
  );
  return { inProduction, ptToday, subToday, rechazoToday, kgProcessed };
}

/** Datos auxiliares para los formularios de producción. */
export type MaterialOption = { id: string; name: string; code: string };

/** GL-53: materiales de salida por tipo (PT/Subproducto/Rechazo). Si un tipo no
 * tiene materiales asignados a su categoría, se cae a TODOS (para no bloquear). */
export interface MaterialsByOutputType {
  PRODUCTO_TERMINADO: MaterialOption[];
  SUBPRODUCTO: MaterialOption[];
  RECHAZO: MaterialOption[];
}

export async function getProductionFormData(): Promise<{
  materials: MaterialOption[];
  materialsByType: MaterialsByOutputType;
  zones: { id: string; name: string; code: string; warehouseName: string }[];
}> {
  const [materials, zones, pt, sub, rechazo] = await Promise.all([
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
    getMaterialsByKind(MaterialKind.PRODUCTO_TERMINADO),
    getMaterialsByKind(MaterialKind.SUBPRODUCTO),
    getMaterialsByKind(MaterialKind.RECHAZO),
  ]);
  const orAll = (list: MaterialOption[]): MaterialOption[] =>
    list.length > 0 ? list : materials;
  return {
    materials,
    materialsByType: {
      PRODUCTO_TERMINADO: orAll(pt),
      SUBPRODUCTO: orAll(sub),
      RECHAZO: orAll(rechazo),
    },
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      warehouseName: z.warehouse.name,
    })),
  };
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
  // GL-55: una saca de PT nueva entra en el ÚNICO lote abierto, INDEPENDIENTE del
  // material (no habrá 4-5 lotes abiertos por material). Un lote ya comprometido a
  // un envío (con ShipmentLot) NO acumula: las nuevas sacas arrancan lote nuevo.
  const existing = await tx.productionLot.findFirst({
    where: {
      type,
      isOpen: true,
      shipmentLots: { none: {} },
    },
    orderBy: { producedAt: "asc" },
  });
  if (existing) return existing;

  const start = startOfToday();
  const countToday = await tx.productionLot.count({
    where: { producedAt: { gte: start } },
  });
  const lotNumber = generateLotNumber(new Date(), countToday + 1);
  return tx.productionLot.create({ data: { lotNumber, type, materialId } });
}

/** Devuelve la transformación abierta del día, o null si no hay ninguna. */
async function findOpenTransformation(tx: Tx): Promise<string | null> {
  const open = await tx.transformation.findFirst({
    where: { endedAt: null, startedAt: { gte: startOfToday() } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  return open?.id ?? null;
}

/**
 * Acumulador de trazabilidad por tipo (GL-37): sacas de entrada de la
 * transformación abierta que AÚN no se han ligado a ninguna saca de salida del
 * tipo indicado. Al crear una salida de ese tipo se ligan estas sacas y, como
 * quedan registradas contra ese tipo, dejan de contar para la próxima salida
 * del mismo tipo (se "resetea" solo ese contador; los otros tipos siguen
 * acumulando las mismas sacas).
 */
async function accumulatedInputSackIds(
  tx: Tx,
  transformationId: string,
  type: LotType,
): Promise<string[]> {
  // Todas las sacas que han entrado a la tolva en esta transformación.
  const inputs = await tx.transformationInput.findMany({
    where: { transformationId },
    select: { sackId: true },
    orderBy: { enteredAt: "asc" },
  });
  const inputIds = inputs.map((i) => i.sackId);
  if (inputIds.length === 0) return [];

  // Sacas de entrada ya ligadas a una salida de ESTE tipo → excluidas.
  const alreadyLinked = await tx.outputSackInput.findMany({
    where: {
      inputSackId: { in: inputIds },
      outputSack: { status: OUTPUT_STATUS[type] },
    },
    select: { inputSackId: true },
  });
  const linkedSet = new Set(alreadyLinked.map((l) => l.inputSackId));

  // Preservar el orden de entrada y evitar duplicados.
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of inputIds) {
    if (linkedSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
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
 * Crea una saca de salida (Producto Terminado / Subproducto / Rechazo)
 * (transaccional). GL-41: solo el Producto Terminado se auto-acumula en el lote
 * PT del día (lotes de 22, GL-36). Los Subproductos y Rechazos se crean SUELTOS
 * (sin lote) y se agrupan manualmente en lotes desde Expediciones.
 */
export async function createOutputSack(input: CreateOutputSackInput): Promise<{
  id: string;
  qrCode: string;
  lotNumber: string | null;
  inputCount: number;
  sackCount: number;
  lotClosed: boolean;
}> {
  if (input.weight <= 0) {
    throw new Error("El peso debe ser mayor que 0.");
  }

  return prisma.$transaction(async (tx) => {
    const lot =
      input.type === LotType.PRODUCTO_TERMINADO
        ? await getOrCreateDailyLot(tx, input.type, input.materialId)
        : null;
    const sack = await tx.sack.create({
      data: {
        qrCode: `SACK-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: OUTPUT_STATUS[input.type],
        weight: input.weight,
        materialId: input.materialId,
        zoneId: input.zoneId ?? null,
        lotId: lot?.id ?? null,
        notes: input.notes ?? null,
      },
    });

    // Trazabilidad (GL-37): ligar las sacas de entrada acumuladas para este
    // tipo. Al quedar registradas contra esta salida, no contarán para la
    // próxima salida del mismo tipo (reset por tipo).
    const transformationId = await findOpenTransformation(tx);
    let inputCount = 0;
    if (transformationId) {
      const inputIds = await accumulatedInputSackIds(
        tx,
        transformationId,
        input.type,
      );
      if (inputIds.length > 0) {
        await tx.outputSackInput.createMany({
          data: inputIds.map((inputSackId) => ({
            outputSackId: sack.id,
            inputSackId,
          })),
        });
        inputCount = inputIds.length;
      }
    }

    // GL-36: al llegar a 22 sacas, el lote PT se cierra automáticamente y queda
    // "listo para enviar". (Solo aplica a PT; sub/rechazo no tienen lote aquí.)
    let sackCount = 0;
    let lotClosed = false;
    if (lot) {
      sackCount = await tx.sack.count({ where: { lotId: lot.id } });
      if (lot.isOpen && sackCount >= MAX_SACKS_PER_LOT) {
        await tx.productionLot.update({
          where: { id: lot.id },
          data: { isOpen: false, closedAt: new Date() },
        });
        lotClosed = true;
      }
    }

    return {
      id: sack.id,
      qrCode: sack.qrCode,
      lotNumber: lot?.lotNumber ?? null,
      inputCount,
      sackCount,
      lotClosed,
    };
  });
}
