import { describe, it, expect, beforeEach, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { LotType } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  registerContainer,
  weighContainer,
  confirmReception,
} from "@/lib/services/reception.service";
import {
  enterHopper,
  createOutputSack,
} from "@/lib/services/production.service";
import {
  createShipment,
  assignLotToShipment,
} from "@/lib/services/shipment.service";
import { createPurchaseOrder } from "@/lib/services/procurement.service";
import { registerPalletMovement } from "@/lib/services/consumable.service";
import { EXPORTS } from "@/lib/export/modules";
import { buildWorkbook, type ExportFile } from "@/lib/export/xlsx";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function exportOf(
  module: keyof typeof EXPORTS,
  query = "",
): Promise<ExportFile> {
  const build = EXPORTS[module];
  if (!build) throw new Error(`Sin exportación: ${module}`);
  return build(new URLSearchParams(query));
}

/** Genera el .xlsx y lo vuelve a leer: hoja → filas (cabecera incluida). */
async function roundTrip(file: ExportFile): Promise<Map<string, unknown[][]>> {
  const wb = new ExcelJS.Workbook();
  const buffer = await buildWorkbook(file.sheets);
  await wb.xlsx.load(Uint8Array.from(buffer).buffer);
  const out = new Map<string, unknown[][]>();
  wb.eachSheet((ws) => {
    const rows: unknown[][] = [];
    ws.eachRow((row) => {
      rows.push((row.values as unknown[]).slice(1));
    });
    out.set(ws.name, rows);
  });
  return out;
}

async function seedWarehouseSacks(n: number): Promise<string[]> {
  const c = await registerContainer({
    reference: `EXP-${Math.random().toString(36).slice(2, 8)}`,
    supplierId: base.supplierId,
    materialId: base.materialId,
  });
  await weighContainer({ containerId: c.id, actualWeight: 1000 * n });
  await confirmReception({
    containerId: c.id,
    materialId: base.materialId,
    zoneId: base.zoneAId,
    numSacks: n,
  });
  const sacks = await prisma.sack.findMany({ where: { containerId: c.id } });
  return sacks.map((s) => s.id);
}

describe("Exportación a Excel", () => {
  it("almacén exporta todas las sacas filtradas, no solo la primera página", async () => {
    await seedWarehouseSacks(60);
    const file = await exportOf("almacen");
    const sheets = await roundTrip(file);
    const rows = sheets.get("Sacas") ?? [];
    expect(rows[0]).toEqual([
      "QR",
      "Material",
      "Peso (kg)",
      "Estado",
      "Almacén",
      "Zona",
      "Lote",
      "Contenedor",
      "Alta",
    ]);
    expect(rows).toHaveLength(61);
    expect(rows[1][3]).toBe("En almacén");

    // Con un estado sin sacas no sale ninguna fila.
    const empty = await roundTrip(await exportOf("almacen", "status=BAJA"));
    expect(empty.get("Sacas")).toHaveLength(1);
  });

  it("producción exporta la pestaña y el turno elegidos", async () => {
    const [s1] = await seedWarehouseSacks(1);
    await enterHopper(s1, base.operarioId);
    const { id } = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 500,
    });
    await prisma.sack.update({
      where: { id },
      data: { createdAt: new Date("2026-09-30T21:30:00Z") }, // 23:30 Madrid
    });

    const noche = await exportOf(
      "produccion",
      "tab=pt&dia=2026-09-30&turno=noche",
    );
    expect(noche.filename).toBe("produccion_pt_2026-09-30_noche");
    const rows = (await roundTrip(noche)).get("Producto Terminado") ?? [];
    expect(rows).toHaveLength(2);
    expect(rows[1][5]).toBe("30/09/2026, 23:30");

    const manana = await exportOf(
      "produccion",
      "tab=pt&dia=2026-09-30&turno=manana",
    );
    expect((await roundTrip(manana)).get("Producto Terminado")).toHaveLength(1);

    const entrada = await roundTrip(await exportOf("produccion"));
    expect(entrada.get("Entrada a tolva")).toHaveLength(2);
  });

  it("recepciones, consumibles, aprovisionamiento y expediciones generan sus hojas", async () => {
    await registerContainer({
      reference: "PEND-1",
      supplierId: base.supplierId,
      materialId: base.materialId,
    });
    await seedWarehouseSacks(2);
    await registerPalletMovement({ buyerId: base.buyerId, quantity: 3 });
    await createPurchaseOrder({
      supplierId: base.supplierId,
      materialId: base.materialId,
      orderedTons: 20,
      totalPrice: 10000,
    });
    const out = await createOutputSack({
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
      weight: 800,
    });
    const lot = await prisma.sack.findUniqueOrThrow({ where: { id: out.id } });
    const shipment = await createShipment({ buyerId: base.buyerId });
    await assignLotToShipment(shipment.id, lot.lotId as string);

    const pend = await roundTrip(await exportOf("recepciones"));
    expect(pend.get("Pendientes de recibir")?.[1]?.[0]).toBe("PEND-1");
    const pesados = await roundTrip(
      await exportOf("recepciones", "tab=pesados"),
    );
    expect(pesados.get("Pesados")).toHaveLength(2);

    const cons = await roundTrip(await exportOf("consumibles"));
    expect([...cons.keys()]).toEqual([
      "Stock",
      "Palés por comprador",
      "Movimientos de palés",
    ]);
    expect(cons.get("Movimientos de palés")?.[1]?.[2]).toBe("Préstamo");

    const apro = await roundTrip(await exportOf("aprovisionamiento"));
    expect(apro.get("Órdenes de compra")?.[1]?.[5]).toBe(20);
    const aproCancel = await roundTrip(
      await exportOf("aprovisionamiento", "status=CANCELADA"),
    );
    expect(aproCancel.get("Órdenes de compra")).toHaveLength(1);

    const lotes = await roundTrip(await exportOf("expediciones"));
    expect(lotes.get("Lotes de salida")).toHaveLength(2);
    const envios = await roundTrip(
      await exportOf("expediciones", "tab=envios"),
    );
    expect(envios.get("Envíos")).toHaveLength(2);
    expect(envios.get("Lotes por envío")).toHaveLength(2);
  });
});
