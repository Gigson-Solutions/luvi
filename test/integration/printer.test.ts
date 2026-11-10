import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createPrinter,
  updatePrinter,
  setPrinterActive,
  getPrinterChoice,
  resolvePrinter,
} from "@/lib/services/printer.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const ZEBRA_1 = { name: "Zebra 1", bridgePort: 631, ip: "192.168.1.212" };
const ZEBRA_2 = { name: "Zebra 2", bridgePort: 632, ip: "192.168.1.213" };

describe("Impresoras — alta", () => {
  it("no deja dos impresoras activas en el mismo puente", async () => {
    await createPrinter(ZEBRA_1);
    await expect(
      createPrinter({ ...ZEBRA_2, bridgePort: 631 }),
    ).rejects.toThrow("El puerto 631 ya lo usa «Zebra 1»");
  });

  it("una impresora desactivada libera su puente, y no se reactiva si está ocupado", async () => {
    const z1 = await createPrinter(ZEBRA_1);
    await setPrinterActive(z1.id, false);
    await createPrinter({ ...ZEBRA_2, bridgePort: 631 });
    await expect(setPrinterActive(z1.id, true)).rejects.toThrow(
      "ya lo usa «Zebra 2»",
    );
  });

  it("editar una impresora no choca con su propio puerto", async () => {
    const z1 = await createPrinter(ZEBRA_1);
    await expect(
      updatePrinter(z1.id, { ...ZEBRA_1, name: "Zebra recepciones" }),
    ).resolves.toEqual({ id: z1.id });
  });
});

describe("Impresoras — elegir al imprimir", () => {
  it("sin impresoras dadas de alta se imprime con el respaldo", async () => {
    expect(await getPrinterChoice(base.operarioId)).toEqual({
      printers: [],
      selectedId: null,
    });
    expect(await resolvePrinter(base.operarioId)).toBeUndefined();
  });

  it("recuerda la última impresora de cada usuario", async () => {
    const z1 = await createPrinter(ZEBRA_1);
    const z2 = await createPrinter(ZEBRA_2);

    // Sin elección previa sale marcada la primera.
    expect((await getPrinterChoice(base.operarioId)).selectedId).toBe(z1.id);

    const target = await resolvePrinter(base.operarioId, z2.id);
    expect(target).toEqual(ZEBRA_2);
    expect((await getPrinterChoice(base.operarioId)).selectedId).toBe(z2.id);
    // La de otro usuario no cambia.
    expect((await getPrinterChoice(base.adminId)).selectedId).toBe(z1.id);
  });

  it("solo ofrece las activas y no imprime en una desactivada", async () => {
    const z1 = await createPrinter(ZEBRA_1);
    const z2 = await createPrinter(ZEBRA_2);
    await resolvePrinter(base.operarioId, z2.id);
    await setPrinterActive(z2.id, false);

    const choice = await getPrinterChoice(base.operarioId);
    expect(choice.printers.map((p) => p.id)).toEqual([z1.id]);
    expect(choice.selectedId).toBe(z1.id);
    await expect(resolvePrinter(base.operarioId, z2.id)).rejects.toThrow(
      "ya no está disponible",
    );
  });
});
