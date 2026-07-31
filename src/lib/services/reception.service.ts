import { prisma } from "@/lib/prisma";
import { SackStatus, type Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

/**
 * Servicio de Recepciones — lógica de negocio pura sobre Container + Sack.
 *
 * Flujo (naming validado con cliente):
 *  1. Registro previo del contenedor/camión (Paula/Alejandro desde Valencia).
 *  2. Pesaje (Gestruck o manual) → actualWeight + weighedAt.
 *  3. Confirmar recepción: se asigna almacén destino y nº de sacas, y se
 *     generan las sacas con QR (status EN_ALMACEN). No hay "sacas sin ubicar".
 */

export type ContainerWithRefs = Prisma.ContainerGetPayload<{
  include: { supplier: true; sacks: true };
}>;

// Re-export de los tipos de saca (módulo puro) para consumo desde el servicio.
export {
  SACK_TYPES,
  SACK_TYPE_LABELS,
  SACK_TYPE_OPTIONS,
  sackTypeLabel,
  type SackType,
} from "@/lib/reception-sack-types";
import type { SackType } from "@/lib/reception-sack-types";

export interface PendingContainerFilters {
  /** Texto libre por referencia/contenedor (case-insensitive). */
  q?: string;
  /** Fecha de llegada prevista en formato YYYY-MM-DD. */
  fecha?: string;
}

/** Contenedores/camiones pendientes de recibir (sin pesar todavía). */
export function listPendingContainers(
  filters: PendingContainerFilters = {},
): Promise<ContainerWithRefs[]> {
  const where: Prisma.ContainerWhereInput = { actualWeight: null };

  if (filters.q?.trim()) {
    where.reference = { contains: filters.q.trim(), mode: "insensitive" };
  }

  if (filters.fecha) {
    const start = new Date(`${filters.fecha}T00:00:00`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.estimatedArrival = { gte: start, lt: end };
    }
  }

  return prisma.container.findMany({
    where,
    include: { supplier: true, sacks: true },
    orderBy: [{ estimatedArrival: "asc" }, { createdAt: "desc" }],
  });
}

/** Contenedores ya recibidos (pesados). */
export function listReceivedContainers(
  limit = 50,
): Promise<ContainerWithRefs[]> {
  return prisma.container.findMany({
    where: { actualWeight: { not: null } },
    include: { supplier: true, sacks: true },
    orderBy: { arrivedAt: "desc" },
    take: limit,
  });
}

export interface RegisterContainerInput {
  reference: string;
  supplierId: string;
  materialId?: string;
  /** Almacén destino declarado (para proyectar ocupación de entrantes). */
  warehouseId?: string;
  billOfLading?: string;
  expectedWeight?: number;
  /**
   * Tara estimada (kg) declarada al registrar. Se guarda en `tareWeight`
   * (vacío hasta el pesaje) para pre-rellenar la Tara al pesar/recibir; el
   * pesaje real la sobrescribe con la tara medida.
   */
  tareWeight?: number;
  numSacks?: number;
  numPallets?: number;
  /** Tipo de saca declarado al registrar. */
  sackType?: SackType;
  estimatedArrival?: Date;
  notes?: string;
}

/** Paso 1 — registro previo del contenedor. */
export function registerContainer(
  input: RegisterContainerInput,
): Promise<ContainerWithRefs> {
  return prisma.container.create({
    data: {
      reference: input.reference,
      supplierId: input.supplierId,
      materialId: input.materialId ?? null,
      warehouseId: input.warehouseId ?? null,
      billOfLading: input.billOfLading ?? null,
      expectedWeight: input.expectedWeight ?? null,
      tareWeight: input.tareWeight ?? null,
      numSacks: input.numSacks ?? null,
      numPallets: input.numPallets ?? 0,
      sackType: input.sackType ?? null,
      estimatedArrival: input.estimatedArrival ?? null,
      notes: input.notes ?? null,
      registeredAt: new Date(),
    },
    include: { supplier: true, sacks: true },
  });
}

export interface WeighInput {
  containerId: string;
  /** Peso neto (kg) — se guarda en actualWeight. */
  actualWeight: number;
  /** Peso bruto real (kg), opcional. */
  grossWeight?: number;
  /** Tara real (kg), opcional. */
  tareWeight?: number;
  weightSource?: "gestruck" | "manual";
  scaleId?: string;
}

/** Paso 2 — registrar pesaje (Gestruck o manual). */
export function weighContainer(input: WeighInput): Promise<ContainerWithRefs> {
  const now = new Date();
  return prisma.container.update({
    where: { id: input.containerId },
    data: {
      actualWeight: input.actualWeight,
      grossWeight: input.grossWeight ?? null,
      tareWeight: input.tareWeight ?? null,
      weightSource: input.weightSource ?? "manual",
      scaleId: input.scaleId ?? null,
      weighedAt: now,
      arrivedAt: now,
    },
    include: { supplier: true, sacks: true },
  });
}

export interface ConfirmReceptionInput {
  containerId: string;
  materialId: string;
  zoneId: string;
  numSacks: number;
  numPallets?: number;
}

/**
 * Paso 3 — confirmar recepción: asigna almacén destino y genera las sacas
 * con QR, repartiendo el peso real entre ellas. Transaccional.
 */
export async function confirmReception(
  input: ConfirmReceptionInput,
): Promise<{ container: ContainerWithRefs; sacksCreated: number }> {
  const container = await prisma.container.findUniqueOrThrow({
    where: { id: input.containerId },
    include: { sacks: true },
  });

  if (container.actualWeight == null) {
    throw new Error(
      "El contenedor debe pesarse antes de confirmar la recepción.",
    );
  }
  if (container.sacks.length > 0) {
    throw new Error("Este contenedor ya tiene sacas generadas.");
  }
  if (input.numSacks < 1) {
    throw new Error("El número de sacas debe ser al menos 1.");
  }

  const weightPerSack =
    Math.round((container.actualWeight / input.numSacks) * 100) / 100;

  const result = await prisma.$transaction(async (tx) => {
    await tx.container.update({
      where: { id: container.id },
      data: {
        materialId: input.materialId,
        numSacks: input.numSacks,
        numPallets: input.numPallets ?? container.numPallets ?? 0,
      },
    });

    await tx.sack.createMany({
      data: Array.from({ length: input.numSacks }, (_, i) => ({
        qrCode: `SACK-${randomUUID().slice(0, 8).toUpperCase()}`,
        status: SackStatus.EN_ALMACEN,
        weight: weightPerSack,
        materialId: input.materialId,
        zoneId: input.zoneId,
        containerId: container.id,
        batchNumber: `${i + 1}/${input.numSacks}`,
      })),
    });

    const updated = await tx.container.findUniqueOrThrow({
      where: { id: container.id },
      include: { supplier: true, sacks: true },
    });
    return updated;
  });

  return { container: result, sacksCreated: input.numSacks };
}

/** Datos auxiliares para los formularios de recepción. */
export function getReceptionFormData(): Promise<{
  suppliers: { id: string; name: string; code: string }[];
  materials: { id: string; name: string; code: string }[];
  zones: { id: string; name: string; code: string; warehouseName: string }[];
  warehouses: { id: string; name: string; code: string }[];
}> {
  return Promise.all([
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
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
    prisma.warehouse.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]).then(([suppliers, materials, zones, warehouses]) => ({
    suppliers,
    materials,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      warehouseName: z.warehouse.name,
    })),
    warehouses,
  }));
}
