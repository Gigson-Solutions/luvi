import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { QualityResult } from "@prisma/client";
import { prisma, resetDb, seedBaseline } from "../db";
import {
  createRecord,
  saveRecord,
  getRecordDetail,
  listMonthlyRecords,
  getMonthlyStats,
  getDensityRange,
  deleteRecord,
  recordStatus,
} from "@/lib/services/quality.service";
import {
  densityStatus,
  DEFAULT_DENSITY_RANGE,
  SAMPLES_PER_RECORD,
} from "@/app/(dashboard)/calidad/quality-thresholds";

beforeEach(async () => {
  await resetDb();
  await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const emptySamples = (): Parameters<typeof saveRecord>[0]["samples"] =>
  Array.from({ length: SAMPLES_PER_RECORD }, (_, i) => ({
    index: i + 1,
    density: null,
    pvc: null,
    cola: null,
    multicapas: null,
    metal: null,
    otros: null,
    comment: null,
  }));

describe("Calidad — helpers de estado", () => {
  it("densityStatus: OK dentro del rango, NOK fuera, PENDIENTE sin dato", () => {
    const range = DEFAULT_DENSITY_RANGE;
    expect(densityStatus(350, range)).toBe("OK");
    expect(densityStatus(300, range)).toBe("NOK");
    expect(densityStatus(400, range)).toBe("NOK");
    expect(densityStatus(null, range)).toBe("PENDIENTE");
  });

  it("recordStatus: NOK si alguna muestra NOK; OK si todas OK; PENDIENTE sin muestras", () => {
    expect(recordStatus([])).toBe("PENDIENTE");
    expect(
      recordStatus([
        { density: 350, status: "OK" },
        { density: 300, status: "NOK" },
      ]),
    ).toBe("NOK");
    expect(
      recordStatus([
        { density: 350, status: "OK" },
        { density: 360, status: "OK" },
      ]),
    ).toBe("OK");
  });
});

describe("Calidad — rango configurable", () => {
  it("getDensityRange devuelve el default sin config", async () => {
    expect(await getDensityRange()).toEqual(DEFAULT_DENSITY_RANGE);
  });

  it("getDensityRange lee config.quality_ranges cuando existe", async () => {
    await prisma.config.create({
      data: {
        key: "quality_ranges",
        value: { densityMin: 300, densityMax: 400 },
      },
    });
    expect(await getDensityRange()).toEqual({ min: 300, max: 400 });
  });
});

describe("Calidad — registros y muestras", () => {
  it("crea un registro diario y lo persiste", async () => {
    const rec = await createRecord({
      date: new Date("2026-07-15T00:00:00"),
      shift: "Mañana",
      client: "Cliente A",
      notes: "Turno tranquilo",
    });

    const persisted = await prisma.qualityRecord.findUnique({
      where: { id: rec.id },
    });
    expect(persisted?.shift).toBe("Mañana");
    expect(persisted?.client).toBe("Cliente A");
    expect(persisted?.result).toBe(QualityResult.PENDIENTE);
    expect(persisted?.lotId).toBeNull();
  });

  it("guarda muestras, autocalcula estado por densidad y agrega el resultado", async () => {
    const rec = await createRecord({ date: new Date("2026-07-10T00:00:00") });

    const samples = emptySamples();
    samples[0] = { ...samples[0], density: 350, pvc: 1.2, comment: "ok" }; // OK
    samples[1] = { ...samples[1], density: 355 }; // OK

    await saveRecord({ id: rec.id, samples });

    const detail = await getRecordDetail(rec.id);
    expect(detail?.samples).toHaveLength(SAMPLES_PER_RECORD);
    expect(detail?.samples[0].status).toBe("OK");
    expect(detail?.samples[0].pvc).toBeCloseTo(1.2, 5);

    // Solo se persisten las muestras con datos (2 de 20).
    const stored = await prisma.qualitySample.count({
      where: { recordId: rec.id },
    });
    expect(stored).toBe(2);

    const record = await prisma.qualityRecord.findUnique({
      where: { id: rec.id },
    });
    expect(record?.result).toBe(QualityResult.OK);
  });

  it("una muestra fuera de rango marca el registro como NOK", async () => {
    const rec = await createRecord({ date: new Date("2026-07-11T00:00:00") });
    const samples = emptySamples();
    samples[0] = { ...samples[0], density: 350 }; // OK
    samples[1] = { ...samples[1], density: 500 }; // NOK
    await saveRecord({ id: rec.id, samples });

    const record = await prisma.qualityRecord.findUnique({
      where: { id: rec.id },
    });
    expect(record?.result).toBe(QualityResult.NOK);
  });

  it("saveRecord reemplaza las muestras anteriores", async () => {
    const rec = await createRecord({ date: new Date("2026-07-12T00:00:00") });
    const first = emptySamples();
    first[0] = { ...first[0], density: 350 };
    first[1] = { ...first[1], density: 351 };
    await saveRecord({ id: rec.id, samples: first });

    const second = emptySamples();
    second[0] = { ...second[0], density: 360 };
    await saveRecord({ id: rec.id, samples: second });

    const stored = await prisma.qualitySample.count({
      where: { recordId: rec.id },
    });
    expect(stored).toBe(1);
  });

  it("getRecordDetail rellena hasta 20 muestras vacías", async () => {
    const rec = await createRecord({ date: new Date("2026-07-13T00:00:00") });
    const detail = await getRecordDetail(rec.id);
    expect(detail?.samples).toHaveLength(SAMPLES_PER_RECORD);
    expect(detail?.samples.every((s) => s.density === null)).toBe(true);
  });

  it("deleteRecord borra el registro y sus muestras (cascade)", async () => {
    const rec = await createRecord({ date: new Date("2026-07-14T00:00:00") });
    const samples = emptySamples();
    samples[0] = { ...samples[0], density: 350 };
    await saveRecord({ id: rec.id, samples });

    await deleteRecord(rec.id);

    expect(
      await prisma.qualityRecord.findUnique({ where: { id: rec.id } }),
    ).toBeNull();
    expect(
      await prisma.qualitySample.count({ where: { recordId: rec.id } }),
    ).toBe(0);
  });
});

describe("Calidad — listado y estadísticas mensuales", () => {
  it("listMonthlyRecords filtra por mes y año", async () => {
    await createRecord({ date: new Date("2026-07-05T00:00:00") });
    await createRecord({ date: new Date("2026-08-05T00:00:00") });

    const july = await listMonthlyRecords(2026, 7);
    expect(july).toHaveLength(1);
    const august = await listMonthlyRecords(2026, 8);
    expect(august).toHaveLength(1);
  });

  it("getMonthlyStats agrega registros, muestras, densidad media y días NOK", async () => {
    const a = await createRecord({ date: new Date("2026-07-06T00:00:00") });
    const sa = emptySamples();
    sa[0] = { ...sa[0], density: 340 }; // OK
    sa[1] = { ...sa[1], density: 360 }; // OK
    await saveRecord({ id: a.id, samples: sa });

    const b = await createRecord({ date: new Date("2026-07-07T00:00:00") });
    const sb = emptySamples();
    sb[0] = { ...sb[0], density: 500 }; // NOK → día NOK
    await saveRecord({ id: b.id, samples: sb });

    const stats = await getMonthlyStats(2026, 7);
    expect(stats.totalRecords).toBe(2);
    expect(stats.totalSamples).toBe(3);
    expect(stats.avgDensity).toBeCloseTo((340 + 360 + 500) / 3, 5);
    expect(stats.nokDays).toBe(1);
  });
});
