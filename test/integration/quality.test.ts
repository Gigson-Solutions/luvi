import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { LotType, QualityResult } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createQualityRecord,
  updateQualityResult,
  listQualityRecords,
  getQualityAverages,
  getQualityFormData,
} from "@/lib/services/quality.service";
import { getOutOfRangeMeasures } from "@/app/(dashboard)/calidad/quality-thresholds";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Crea un ProductionLot (PRODUCTO_TERMINADO) con el material de baseline. */
async function createLot(lotNumber: string): Promise<string> {
  const lot = await prisma.productionLot.create({
    data: {
      lotNumber,
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
    },
  });
  return lot.id;
}

describe("Calidad — registro y evaluación de lotes", () => {
  it("crea un registro de calidad para un lote existente y lo persiste", async () => {
    const lotId = await createLot("080726-1");

    const rec = await createQualityRecord({
      lotId,
      materialId: base.materialId,
      supplierId: base.supplierId,
      shift: "M",
      result: QualityResult.OK,
      density: 0.95,
      pvcPct: 1.2,
      gluePct: 3,
      multilayerPct: 4,
      metalPct: 0.5,
      otherPct: 2,
      notes: "Muestra dentro de rango",
    });

    // Devuelve el registro con sus relaciones incluidas.
    expect(rec.id).toBeTruthy();
    expect(rec.result).toBe(QualityResult.OK);
    expect(rec.lot.id).toBe(lotId);
    expect(rec.material.id).toBe(base.materialId);
    expect(rec.supplier?.id).toBe(base.supplierId);
    expect(rec.density).toBeCloseTo(0.95, 5);

    // Persistido realmente en BD.
    const persisted = await prisma.qualityRecord.findUnique({
      where: { id: rec.id },
    });
    expect(persisted).not.toBeNull();
    expect(persisted?.shift).toBe("M");
    expect(persisted?.pvcPct).toBeCloseTo(1.2, 5);
    expect(persisted?.notes).toBe("Muestra dentro de rango");
  });

  it("permite registrar sin proveedor ni medidas (campos opcionales → null)", async () => {
    const lotId = await createLot("080726-2");

    const rec = await createQualityRecord({
      lotId,
      materialId: base.materialId,
      result: QualityResult.PENDIENTE,
    });

    expect(rec.result).toBe(QualityResult.PENDIENTE);
    expect(rec.supplierId).toBeNull();
    expect(rec.supplier).toBeNull();
    expect(rec.density).toBeNull();
    expect(rec.overrideReason).toBeNull();
  });

  it("aparece en el listado, más recientes primero", async () => {
    const lot1 = await createLot("080726-3");
    const lot2 = await createLot("080726-4");

    const first = await createQualityRecord({
      lotId: lot1,
      materialId: base.materialId,
      result: QualityResult.OK,
    });
    // recordedAt tiene resolución de ms; separamos para un orden determinista.
    await new Promise((r) => setTimeout(r, 10));
    const second = await createQualityRecord({
      lotId: lot2,
      materialId: base.materialId,
      result: QualityResult.NOK,
    });

    const list = await listQualityRecords();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(second.id);
    expect(list[1].id).toBe(first.id);
  });

  describe("Regla de override (fuera de rango → OK exige motivo)", () => {
    it("detecta los parámetros fuera de rango con el helper de umbrales", async () => {
      // pvcPct máx 2, metalPct máx 1, density rango 0.85–1.05.
      const out = getOutOfRangeMeasures({
        density: 1.2, // > max
        pvcPct: 5, // > max
        gluePct: 3, // ok
        metalPct: 0.4, // ok
      });
      expect(out).toContain("density");
      expect(out).toContain("pvcPct");
      expect(out).not.toContain("gluePct");
      expect(out).not.toContain("metalPct");
    });

    it("guarda el overrideReason cuando se fuerza OK fuera de rango", async () => {
      const lotId = await createLot("080726-5");

      const rec = await createQualityRecord({
        lotId,
        materialId: base.materialId,
        result: QualityResult.OK,
        pvcPct: 6, // fuera de rango (máx 2)
        overrideReason: "Cliente acepta lote con desviación puntual",
      });

      expect(rec.result).toBe(QualityResult.OK);
      expect(rec.overrideReason).toBe(
        "Cliente acepta lote con desviación puntual",
      );

      const persisted = await prisma.qualityRecord.findUnique({
        where: { id: rec.id },
      });
      expect(persisted?.overrideReason).toBe(
        "Cliente acepta lote con desviación puntual",
      );
    });

    it("el servicio NO valida el override por sí mismo (la regla vive en la Server Action)", async () => {
      const lotId = await createLot("080726-6");

      // Forzar OK con parámetro fuera de rango y SIN motivo:
      // el servicio persiste tal cual (la validación está en actions.ts vía
      // getOutOfRangeMeasures). Documentamos el comportamiento real.
      const rec = await createQualityRecord({
        lotId,
        materialId: base.materialId,
        result: QualityResult.OK,
        pvcPct: 6, // fuera de rango, sin overrideReason
      });
      expect(rec.result).toBe(QualityResult.OK);
      expect(rec.overrideReason).toBeNull();

      // Pero el helper que usa la acción sí lo marcaría como fuera de rango.
      expect(getOutOfRangeMeasures({ pvcPct: 6 })).toContain("pvcPct");
    });
  });

  it("actualiza el resultado de un registro (PENDIENTE → NOK → OK con override)", async () => {
    const lotId = await createLot("080726-7");
    const rec = await createQualityRecord({
      lotId,
      materialId: base.materialId,
      result: QualityResult.PENDIENTE,
    });

    const nok = await updateQualityResult({
      id: rec.id,
      result: QualityResult.NOK,
    });
    expect(nok.result).toBe(QualityResult.NOK);
    expect(nok.overrideReason).toBeNull();

    const ok = await updateQualityResult({
      id: rec.id,
      result: QualityResult.OK,
      overrideReason: "Revisado por laboratorio",
    });
    expect(ok.result).toBe(QualityResult.OK);
    expect(ok.overrideReason).toBe("Revisado por laboratorio");

    const persisted = await prisma.qualityRecord.findUnique({
      where: { id: rec.id },
    });
    expect(persisted?.result).toBe(QualityResult.OK);
    expect(persisted?.overrideReason).toBe("Revisado por laboratorio");
  });

  describe("Promedios por proveedor/material", () => {
    it("calcula la media de cada parámetro agrupando por proveedor y material", async () => {
      const lot1 = await createLot("080726-8");
      const lot2 = await createLot("080726-9");

      await createQualityRecord({
        lotId: lot1,
        materialId: base.materialId,
        supplierId: base.supplierId,
        result: QualityResult.OK,
        density: 0.9,
        pvcPct: 1,
      });
      await createQualityRecord({
        lotId: lot2,
        materialId: base.materialId,
        supplierId: base.supplierId,
        result: QualityResult.OK,
        density: 1.0,
        pvcPct: 3,
      });

      const groups = await getQualityAverages();
      expect(groups).toHaveLength(1);
      const g = groups[0];
      expect(g.supplierId).toBe(base.supplierId);
      expect(g.supplierName).toBe("Proveedor Test");
      expect(g.materialId).toBe(base.materialId);
      expect(g.count).toBe(2);
      // (0.9 + 1.0) / 2 = 0.95 ; (1 + 3) / 2 = 2
      expect(g.averages.density).toBeCloseTo(0.95, 5);
      expect(g.averages.pvcPct).toBeCloseTo(2, 5);
      // Parámetros no medidos → media null.
      expect(g.averages.gluePct).toBeNull();
    });

    it("agrupa por separado un registro sin proveedor (supplierId null)", async () => {
      const lotA = await createLot("080726-10");
      const lotB = await createLot("080726-11");

      await createQualityRecord({
        lotId: lotA,
        materialId: base.materialId,
        supplierId: base.supplierId,
        result: QualityResult.OK,
        density: 0.9,
      });
      await createQualityRecord({
        lotId: lotB,
        materialId: base.materialId,
        result: QualityResult.OK,
        density: 1.0,
      });

      const groups = await getQualityAverages();
      expect(groups).toHaveLength(2);

      const withSupplier = groups.find((g) => g.supplierId === base.supplierId);
      const withoutSupplier = groups.find((g) => g.supplierId === null);
      expect(withSupplier?.count).toBe(1);
      expect(withSupplier?.averages.density).toBeCloseTo(0.9, 5);
      expect(withoutSupplier?.count).toBe(1);
      expect(withoutSupplier?.supplierName).toBe("Sin proveedor");
      expect(withoutSupplier?.averages.density).toBeCloseTo(1.0, 5);
    });

    it("devuelve lista vacía si no hay registros", async () => {
      expect(await getQualityAverages()).toEqual([]);
    });
  });

  it("getQualityFormData expone lotes, materiales y proveedores", async () => {
    const lotId = await createLot("080726-12");
    await createQualityRecord({
      lotId,
      materialId: base.materialId,
      result: QualityResult.OK,
    });

    const data = await getQualityFormData();
    expect(data.lots.map((l) => l.id)).toContain(lotId);
    expect(data.lots.find((l) => l.id === lotId)?.materialName).toBe(
      "Pellet PE Test",
    );
    expect(data.materials.map((m) => m.id)).toContain(base.materialId);
    expect(data.suppliers.map((s) => s.id)).toContain(base.supplierId);
  });
});
