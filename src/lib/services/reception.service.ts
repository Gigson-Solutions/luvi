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

/** Contenedores/camiones pendientes de recibir (sin pesar todavía). */
export function listPendingContainers(): Promise<ContainerWithRefs[]> {
  return prisma.container.findMany({
    where: { actualWeight: null },
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
  billOfLading?: string;
  expectedWeight?: number;
  numSacks?: number;
  numPallets?: number;
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
      billOfLading: input.billOfLading ?? null,
      expectedWeight: input.expectedWeight ?? null,
      numSacks: input.numSacks ?? null,
      numPallets: input.numPallets ?? 0,
      estimatedArrival: input.estimatedArrival ?? null,
      notes: input.notes ?? null,
      registeredAt: new Date(),
    },
    include: { supplier: true, sacks: true },
  });
}

export interface WeighInput {
  containerId: string;
  actualWeight: number;
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
  ]).then(([suppliers, materials, zones]) => ({
    suppliers,
    materials,
    zones: zones.map((z) => ({
      id: z.id,
      name: z.name,
      code: z.code,
      warehouseName: z.warehouse.name,
    })),
  }));
}
