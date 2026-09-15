import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import { registerPalletReturn } from "@/lib/services/consumable.service";
import {
  addBrokenPallets,
  getBrokenPalletStock,
  listBrokenPalletMovements,
  shipBrokenPallets,
} from "@/lib/services/broken-pallet.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Inventario — palés rotos", () => {
  it("los palés rotos de una devolución se acumulan en su stock (los OK no)", async () => {
    await registerPalletReturn({
      buyerId: base.buyerId,
      okCount: 10,
      brokenCount: 4,
      vehiclePlate: "1234-ABC",
    });
    await registerPalletReturn({
      buyerId: base.buyerId,
      okCount: 0,
      brokenCount: 3,
    });

    expect(await getBrokenPalletStock()).toBe(7);
    const movements = await listBrokenPalletMovements();
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.source === "devolución")).toBe(true);
    expect(movements.every((m) => m.buyer?.id === base.buyerId)).toBe(true);
  });

  it("una devolución sin rotos no toca el stock de palés rotos", async () => {
    await registerPalletReturn({
      buyerId: base.buyerId,
      okCount: 5,
      brokenCount: 0,
    });
    expect(await getBrokenPalletStock()).toBe(0);
  });

  it("permite añadir palés rotos a mano", async () => {
    expect(await addBrokenPallets({ quantity: 6, notes: "recuento" })).toBe(6);
    expect(await addBrokenPallets({ quantity: 2 })).toBe(8);
    expect(await getBrokenPalletStock()).toBe(8);
  });

  it("rechaza cantidades no válidas", async () => {
    await expect(addBrokenPallets({ quantity: 0 })).rejects.toThrow();
    await expect(addBrokenPallets({ quantity: -3 })).rejects.toThrow();
    await expect(addBrokenPallets({ quantity: 1.5 })).rejects.toThrow();
  });

  it("la salida descuenta las unidades y genera el albarán en Holded", async () => {
    await addBrokenPallets({ quantity: 10 });

    const res = await shipBrokenPallets({
      buyerId: base.buyerId,
      quantity: 4,
    });

    expect(res.stock).toBe(6);
    expect(res.reference).toMatch(/^PR-\d{6}-001$/);
    expect(res.holdedAlbaranId).toBeTruthy();
    expect(await getBrokenPalletStock()).toBe(6);

    const salida = await prisma.brokenPalletMovement.findUniqueOrThrow({
      where: { reference: res.reference },
    });
    expect(salida.quantity).toBe(-4);
    expect(salida.source).toBe("salida");
    expect(salida.buyerId).toBe(base.buyerId);
    expect(salida.holdedAlbaranId).toBe(res.holdedAlbaranId);
  });

  it("no permite enviar más palés rotos de los disponibles", async () => {
    await addBrokenPallets({ quantity: 3 });

    await expect(
      shipBrokenPallets({ buyerId: base.buyerId, quantity: 4 }),
    ).rejects.toThrow(/disponibles 3/);
    expect(await getBrokenPalletStock()).toBe(3);
    expect(
      await prisma.brokenPalletMovement.count({ where: { source: "salida" } }),
    ).toBe(0);
  });

  it("dos salidas a la vez no dejan el stock en negativo", async () => {
    await addBrokenPallets({ quantity: 5 });

    const results = await Promise.allSettled([
      shipBrokenPallets({ buyerId: base.buyerId, quantity: 3 }),
      shipBrokenPallets({ buyerId: base.buyerId, quantity: 3 }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await getBrokenPalletStock()).toBe(2);
  });

  it("la salida falla si el destinatario no existe y no descuenta nada", async () => {
    await addBrokenPallets({ quantity: 5 });
    await expect(
      shipBrokenPallets({ buyerId: "no-existe", quantity: 1 }),
    ).rejects.toThrow(/destinatario/);
    expect(await getBrokenPalletStock()).toBe(5);
  });
});
