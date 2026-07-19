import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { ConsumableType } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  registerConsumableMovement,
  listConsumables,
  listLowStockConsumables,
  getConsumableStats,
  getConsumableOptions,
  registerPalletMovement,
  listBuyerPalletBalances,
  getPalletStats,
  getBuyerOptions,
} from "@/lib/services/consumable.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Consumibles — movimientos de stock", () => {
  it("registra una entrada y sube currentStock por la cantidad", async () => {
    // baseline: palletConsumable currentStock = 100
    const updated = await registerConsumableMovement({
      consumableId: base.palletConsumableId,
      quantity: 40,
      reason: "compra",
    });
    expect(updated.currentStock).toBe(140);

    // el movimiento queda persistido
    const movements = await prisma.consumableMovement.findMany({
      where: { consumableId: base.palletConsumableId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].quantity).toBe(40);
    expect(movements[0].reason).toBe("compra");
  });

  it("registra una salida y baja currentStock", async () => {
    const updated = await registerConsumableMovement({
      consumableId: base.palletConsumableId,
      quantity: -30,
      reason: "expedición",
      vehiclePlate: "1234-ABC",
    });
    expect(updated.currentStock).toBe(70);

    const movement = await prisma.consumableMovement.findFirst({
      where: { consumableId: base.palletConsumableId },
    });
    expect(movement?.quantity).toBe(-30);
    expect(movement?.vehiclePlate).toBe("1234-ABC");
  });

  it("rechaza una salida que dejaría el stock en negativo y no crea movimiento", async () => {
    await expect(
      registerConsumableMovement({
        consumableId: base.palletConsumableId,
        quantity: -101, // stock actual = 100
        reason: "ajuste",
      }),
    ).rejects.toThrow();

    // stock intacto
    const consumable = await prisma.consumable.findUniqueOrThrow({
      where: { id: base.palletConsumableId },
    });
    expect(consumable.currentStock).toBe(100);

    // transacción revertida → sin movimientos
    const count = await prisma.consumableMovement.count({
      where: { consumableId: base.palletConsumableId },
    });
    expect(count).toBe(0);
  });

  it("permite una salida que deja el stock exactamente en cero", async () => {
    const updated = await registerConsumableMovement({
      consumableId: base.palletConsumableId,
      quantity: -100,
      reason: "ajuste",
    });
    expect(updated.currentStock).toBe(0);
  });

  it("rechaza una cantidad de cero", async () => {
    await expect(
      registerConsumableMovement({
        consumableId: base.palletConsumableId,
        quantity: 0,
        reason: "ajuste",
      }),
    ).rejects.toThrow();
  });

  it("lista los consumibles ordenados", async () => {
    const list = await listConsumables();
    expect(list.map((c) => c.id)).toContain(base.palletConsumableId);
  });

  it("expone opciones de consumibles para selects", async () => {
    const options = await getConsumableOptions();
    const pallet = options.find((o) => o.id === base.palletConsumableId);
    expect(pallet).toBeDefined();
    expect(pallet?.type).toBe(ConsumableType.PALLET);
    expect(pallet?.unit).toBe("ud");
  });
});

describe("Consumibles — alertas de stock bajo mínimo", () => {
  it("un consumible por debajo de su minStock aparece en la lista de alertas", async () => {
    // baseline pallet: stock 100, min 20 → no está bajo mínimo
    const low = await prisma.consumable.create({
      data: {
        type: ConsumableType.CAPUCHON,
        name: "Capuchón escaso",
        currentStock: 5,
        minStock: 50,
      },
    });

    const alerts = await listLowStockConsumables();
    const ids = alerts.map((c) => c.id);
    expect(ids).toContain(low.id);
    expect(ids).not.toContain(base.palletConsumableId);
  });

  it("cae bajo mínimo tras una salida y entra en alertas", async () => {
    // pallet baseline: stock 100, min 20. Salida de -85 → stock 15 < 20
    await registerConsumableMovement({
      consumableId: base.palletConsumableId,
      quantity: -85,
      reason: "expedición",
    });

    const alerts = await listLowStockConsumables();
    expect(alerts.map((c) => c.id)).toContain(base.palletConsumableId);
  });

  it("stock igual al mínimo NO se considera bajo mínimo (estricto <)", async () => {
    const atMin = await prisma.consumable.create({
      data: {
        type: ConsumableType.SACA_VACIA,
        name: "Saca justa",
        currentStock: 20,
        minStock: 20,
      },
    });
    const alerts = await listLowStockConsumables();
    expect(alerts.map((c) => c.id)).not.toContain(atMin.id);
  });

  it("getConsumableStats agrega referencias, unidades y bajo mínimo", async () => {
    await prisma.consumable.create({
      data: {
        type: ConsumableType.CAPUCHON,
        name: "Capuchón escaso",
        currentStock: 5,
        minStock: 50,
      },
    });

    const stats = await getConsumableStats();
    // 2 referencias: pallet baseline (100) + capuchón (5)
    expect(stats.totalReferences).toBe(2);
    expect(stats.totalUnits).toBe(105);
    expect(stats.belowMinimum).toBe(1);
  });
});

describe("Consumibles — palés retornables por comprador", () => {
  it("registra préstamo y devolución y calcula el saldo neto del comprador", async () => {
    // préstamo de 30
    await registerPalletMovement({ buyerId: base.buyerId, quantity: 30 });
    // devolución de 10 en buen estado
    await registerPalletMovement({
      buyerId: base.buyerId,
      quantity: -10,
      condition: "OK",
    });
    // devolución de 5 defectuosos
    await registerPalletMovement({
      buyerId: base.buyerId,
      quantity: -5,
      condition: "NOK",
    });

    const balances = await listBuyerPalletBalances();
    const mine = balances.find((b) => b.buyerId === base.buyerId);
    expect(mine).toBeDefined();
    // 30 - 10 - 5 = 15 netos pendientes
    expect(mine?.balance).toBe(15);
    expect(mine?.buyerCode).toBe("BUY-T1");

    // se persistió con condición
    const movements = await prisma.palletMovement.findMany({
      where: { buyerId: base.buyerId },
      orderBy: { quantity: "asc" },
    });
    expect(movements).toHaveLength(3);
    expect(movements.map((m) => m.condition)).toContain("OK");
    expect(movements.map((m) => m.condition)).toContain("NOK");
  });

  it("un comprador sin movimientos tiene saldo 0", async () => {
    const balances = await listBuyerPalletBalances();
    const mine = balances.find((b) => b.buyerId === base.buyerId);
    expect(mine?.balance).toBe(0);
  });

  it("rechaza un movimiento de palés con cantidad cero", async () => {
    await expect(
      registerPalletMovement({ buyerId: base.buyerId, quantity: 0 }),
    ).rejects.toThrow();
  });

  it("getPalletStats cuenta solo saldos positivos pendientes de devolver", async () => {
    // otro comprador que devuelve de más → saldo negativo, no debe contar
    const otherBuyer = await prisma.buyer.create({
      data: { name: "Comprador Dos", code: "BUY-T2", country: "ES" },
    });
    await registerPalletMovement({ buyerId: base.buyerId, quantity: 40 });
    await registerPalletMovement({ buyerId: otherBuyer.id, quantity: -5 });

    const stats = await getPalletStats();
    expect(stats.totalLoaned).toBe(40); // solo el saldo positivo
    expect(stats.buyersWithPallets).toBe(1);
  });

  it("expone las opciones de compradores activos", async () => {
    const options = await getBuyerOptions();
    expect(options.map((o) => o.id)).toContain(base.buyerId);
  });
});
