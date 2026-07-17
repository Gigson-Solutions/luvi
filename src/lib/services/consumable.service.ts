import { prisma } from "@/lib/prisma";
import { ConsumableType, type Consumable, type Prisma } from "@prisma/client";

/**
 * Servicio de Consumibles — lógica de negocio sobre Consumable, ConsumableMovement
 * y PalletMovement (palés retornables por comprador).
 *
 * Reglas:
 *  - ConsumableMovement.quantity: positivo = entrada (compra), negativo = salida (ajuste).
 *  - El currentStock del consumible se recalcula sumando el movimiento (transacción).
 *  - PalletMovement.quantity: positivo = préstamo al comprador, negativo = devolución.
 *  - El saldo neto de palés de un comprador es la suma de sus PalletMovement.
 */

// ─── Etiquetas de tipos ────────────────────────────────────────────────────────

export const CONSUMABLE_TYPE_LABELS: Record<ConsumableType, string> = {
  PALLET: "Palé",
  SACA_VACIA: "Saca vacía",
  CAPUCHON: "Capuchón",
  OTRO: "Otro",
};

// ─── Stock de consumibles ──────────────────────────────────────────────────────

/** Todos los consumibles ordenados por tipo y nombre. */
export function listConsumables(): Promise<Consumable[]> {
  return prisma.consumable.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

/** Consumibles por debajo de su umbral mínimo (currentStock < minStock). */
export async function listLowStockConsumables(): Promise<Consumable[]> {
  const all = await prisma.consumable.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  return all.filter((c) => c.currentStock < c.minStock);
}

export interface ConsumableStats {
  totalReferences: number;
  totalUnits: number;
  belowMinimum: number;
}

/** Totales para las StatCards del panel de stock. */
export async function getConsumableStats(): Promise<ConsumableStats> {
  const consumables = await prisma.consumable.findMany({
    select: { currentStock: true, minStock: true },
  });
  return {
    totalReferences: consumables.length,
    totalUnits: consumables.reduce((sum, c) => sum + c.currentStock, 0),
    belowMinimum: consumables.filter((c) => c.currentStock < c.minStock).length,
  };
}

/** Consumibles para los selects de los formularios. */
export function getConsumableOptions(): Promise<
  { id: string; name: string; type: ConsumableType; unit: string }[]
> {
  return prisma.consumable.findMany({
    select: { id: true, name: true, type: true, unit: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

export interface RegisterMovementInput {
  consumableId: string;
  quantity: number; // positivo = entrada, negativo = salida
  reason: string;
  vehiclePlate?: string;
  notes?: string;
}

/**
 * Registra un movimiento de consumible y actualiza el stock en una transacción.
 * No se permite dejar el stock en negativo.
 */
export async function registerConsumableMovement(
  input: RegisterMovementInput,
): Promise<Consumable> {
  if (input.quantity === 0) {
    throw new Error("La cantidad no puede ser cero.");
  }

  return prisma.$transaction(async (tx) => {
    const consumable = await tx.consumable.findUniqueOrThrow({
      where: { id: input.consumableId },
    });

    const nextStock = consumable.currentStock + input.quantity;
    if (nextStock < 0) {
      throw new Error(
        `Stock insuficiente: quedan ${consumable.currentStock} ${consumable.unit}.`,
      );
    }

    await tx.consumableMovement.create({
      data: {
        consumableId: input.consumableId,
        quantity: input.quantity,
        reason: input.reason,
        vehiclePlate: input.vehiclePlate ?? null,
        notes: input.notes ?? null,
      },
    });

    return tx.consumable.update({
      where: { id: input.consumableId },
      data: { currentStock: nextStock },
    });
  });
}

// ─── Palés retornables por comprador ───────────────────────────────────────────

export interface BuyerPalletBalance {
  buyerId: string;
  buyerName: string;
  buyerCode: string;
  balance: number; // palés netos pendientes de devolver
}

/** Saldo neto de palés prestados por comprador (suma de PalletMovement.quantity). */
export async function listBuyerPalletBalances(): Promise<BuyerPalletBalance[]> {
  const [buyers, grouped] = await Promise.all([
    prisma.buyer.findMany({
      where: { active: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.palletMovement.groupBy({
      by: ["buyerId"],
      _sum: { quantity: true },
    }),
  ]);

  const balanceByBuyer = new Map<string, number>(
    grouped.map((g) => [g.buyerId, g._sum.quantity ?? 0]),
  );

  return buyers
    .map((b) => ({
      buyerId: b.id,
      buyerName: b.name,
      buyerCode: b.code,
      balance: balanceByBuyer.get(b.id) ?? 0,
    }))
    .sort((a, b) => b.balance - a.balance);
}

export interface PalletStats {
  totalLoaned: number; // total pendiente de devolver (saldos positivos)
  buyersWithPallets: number;
}

/** Totales del panel de palés retornables. */
export async function getPalletStats(): Promise<PalletStats> {
  const balances = await listBuyerPalletBalances();
  const positive = balances.filter((b) => b.balance > 0);
  return {
    totalLoaned: positive.reduce((sum, b) => sum + b.balance, 0),
    buyersWithPallets: positive.length,
  };
}

/** Compradores activos para el select del diálogo de palés. */
export function getBuyerOptions(): Promise<
  { id: string; name: string; code: string }[]
> {
  return prisma.buyer.findMany({
    where: { active: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
}

export interface RegisterPalletMovementInput {
  buyerId: string;
  quantity: number; // positivo = préstamo, negativo = devolución
  condition?: "OK" | "NOK";
  notes?: string;
}

/** Registra un préstamo (+) o devolución (−) de palés a un comprador. */
export async function registerPalletMovement(
  input: RegisterPalletMovementInput,
): Promise<void> {
  if (input.quantity === 0) {
    throw new Error("La cantidad no puede ser cero.");
  }

  await prisma.palletMovement.create({
    data: {
      buyerId: input.buyerId,
      quantity: input.quantity,
      condition: input.condition ?? null,
      notes: input.notes ?? null,
    },
  });
}

// ─── Devolución de palés (con desglose OK / rotos) ─────────────────────────────

/** Consumibles de tipo palé, destino del stock de los palés devueltos OK. */
export function listPalletConsumables(): Promise<
  { id: string; name: string; unit: string }[]
> {
  return prisma.consumable.findMany({
    where: { type: ConsumableType.PALLET },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });
}

export interface RegisterPalletReturnInput {
  buyerId: string;
  /** Palés recibidos en buen estado → descuentan deuda y vuelven a stock. */
  okCount: number;
  /** Palés recibidos rotos/NOK → descuentan deuda y quedan en histórico. */
  brokenCount: number;
  vehiclePlate?: string;
  /** Fecha de la devolución (por defecto, ahora). */
  date?: Date;
  /** Consumible palé destino de los OK; si no se indica y hay uno solo, se usa ese. */
  palletConsumableId?: string;
  notes?: string;
}

export interface PalletReturnResult {
  received: number;
  /** OK que efectivamente volvieron a stock (0 si no se resolvió el consumible). */
  restocked: number;
  broken: number;
}

/**
 * Registra la devolución de palés de un comprador desglosada en OK y rotos.
 * Los OK descuentan deuda y vuelven al stock del consumible palé; los rotos
 * descuentan deuda pero quedan solo en el histórico. Todo en una transacción.
 */
export async function registerPalletReturn(
  input: RegisterPalletReturnInput,
): Promise<PalletReturnResult> {
  const ok = Math.trunc(input.okCount);
  const broken = Math.trunc(input.brokenCount);
  if (ok < 0 || broken < 0) {
    throw new Error("Las cantidades no pueden ser negativas.");
  }
  const received = ok + broken;
  if (received <= 0) {
    throw new Error("Indica al menos un palé recibido (OK o roto).");
  }

  return prisma.$transaction(async (tx) => {
    const when = input.date;

    // Resolver el consumible palé destino de los OK (si procede).
    let palletConsumableId = input.palletConsumableId;
    if (ok > 0 && !palletConsumableId) {
      const pallets = await tx.consumable.findMany({
        where: { type: ConsumableType.PALLET },
        select: { id: true },
      });
      if (pallets.length === 1) palletConsumableId = pallets[0].id;
    }

    let restocked = 0;

    // Palés OK → descuentan deuda (movimiento −) y vuelven al stock físico.
    if (ok > 0) {
      await tx.palletMovement.create({
        data: {
          buyerId: input.buyerId,
          quantity: -ok,
          condition: "OK",
          vehiclePlate: input.vehiclePlate ?? null,
          notes: input.notes ?? null,
          ...(when ? { createdAt: when } : {}),
        },
      });
      if (palletConsumableId) {
        const c = await tx.consumable.findUniqueOrThrow({
          where: { id: palletConsumableId },
        });
        await tx.consumableMovement.create({
          data: {
            consumableId: palletConsumableId,
            quantity: ok,
            reason: "devolución",
            vehiclePlate: input.vehiclePlate ?? null,
            condition: "OK",
            notes: input.notes ?? null,
            ...(when ? { createdAt: when } : {}),
          },
        });
        await tx.consumable.update({
          where: { id: palletConsumableId },
          data: { currentStock: c.currentStock + ok },
        });
        restocked = ok;
      }
    }

    // Palés rotos → descuentan deuda pero no vuelven a stock (solo histórico).
    if (broken > 0) {
      await tx.palletMovement.create({
        data: {
          buyerId: input.buyerId,
          quantity: -broken,
          condition: "NOK",
          vehiclePlate: input.vehiclePlate ?? null,
          notes: input.notes ?? null,
          ...(when ? { createdAt: when } : {}),
        },
      });
    }

    return { received, restocked, broken };
  });
}

// ─── Histórico de movimientos de palés (por comprador) ─────────────────────────

export type PalletMovementWithBuyer = Prisma.PalletMovementGetPayload<{
  include: { buyer: true };
}>;

/** Histórico de movimientos de palés, más recientes primero (opc. por comprador). */
export function listPalletMovements(
  buyerId?: string,
  limit = 100,
): Promise<PalletMovementWithBuyer[]> {
  return prisma.palletMovement.findMany({
    where: buyerId ? { buyerId } : {},
    include: { buyer: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
