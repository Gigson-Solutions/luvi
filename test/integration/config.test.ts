import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { MaterialType } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  listMaterials,
  createMaterial,
  updateMaterial,
  setMaterialActive,
  listSuppliers,
  createSupplier,
  updateSupplier,
  setSupplierActive,
  listBuyers,
  createBuyer,
  updateBuyer,
  setBuyerActive,
  listCarriers,
  createCarrier,
  updateCarrier,
  setCarrierActive,
  listWarehouses,
  createWarehouse,
  updateWarehouse,
  setWarehouseActive,
  createZone,
  updateZone,
  deleteZone,
} from "@/lib/services/config.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ─── Materiales ────────────────────────────────────────────────────────────────

describe("Configuración — Materiales", () => {
  it("crea y lista un material", async () => {
    const { id } = await createMaterial({
      name: "Pellet PP Config",
      code: "PP-CFG-1",
      type: MaterialType.PELLET_PP,
      description: "material de prueba",
    });
    const materials = await listMaterials();
    const created = materials.find((m) => m.id === id);
    expect(created).toBeDefined();
    expect(created?.name).toBe("Pellet PP Config");
    expect(created?.code).toBe("PP-CFG-1");
    expect(created?.type).toBe(MaterialType.PELLET_PP);
    expect(created?.description).toBe("material de prueba");
    expect(created?.active).toBe(true);
  });

  it("edita un material", async () => {
    const { id } = await createMaterial({
      name: "Original",
      code: "MAT-EDIT",
      type: MaterialType.FILM_PE,
    });
    await updateMaterial(id, {
      name: "Editado",
      code: "MAT-EDIT",
      type: MaterialType.FILM_PP,
      description: "nueva desc",
    });
    const m = await prisma.material.findUniqueOrThrow({ where: { id } });
    expect(m.name).toBe("Editado");
    expect(m.type).toBe(MaterialType.FILM_PP);
    expect(m.description).toBe("nueva desc");
  });

  it("soft-delete: material inactivo deja de figurar como activo en el listado", async () => {
    const { id } = await createMaterial({
      name: "A desactivar",
      code: "MAT-DEL",
      type: MaterialType.OTRO,
    });
    await setMaterialActive(id, false);
    const materials = await listMaterials();
    const found = materials.find((m) => m.id === id);
    // Sigue apareciendo pero marcado inactivo (no se borra físicamente).
    expect(found).toBeDefined();
    expect(found?.active).toBe(false);
    // Solo activos:
    const activos = materials.filter((m) => m.active);
    expect(activos.map((m) => m.id)).not.toContain(id);
    // Y el registro no fue borrado de la BD.
    expect(await prisma.material.count({ where: { id } })).toBe(1);
  });
});

// ─── Proveedores ───────────────────────────────────────────────────────────────

describe("Configuración — Proveedores", () => {
  it("crea y lista un proveedor", async () => {
    const { id } = await createSupplier({
      name: "Proveedor Config",
      code: "PROV-CFG",
      country: "PT",
      notes: "nota",
    });
    const list = await listSuppliers();
    const created = list.find((s) => s.id === id);
    expect(created).toBeDefined();
    expect(created?.country).toBe("PT");
    expect(created?.notes).toBe("nota");
    expect(created?.active).toBe(true);
  });

  it("edita un proveedor", async () => {
    const { id } = await createSupplier({
      name: "Prov A",
      code: "PROV-E",
      country: "ES",
    });
    await updateSupplier(id, { name: "Prov B", code: "PROV-E", country: "FR" });
    const s = await prisma.supplier.findUniqueOrThrow({ where: { id } });
    expect(s.name).toBe("Prov B");
    expect(s.country).toBe("FR");
  });

  it("soft-delete: proveedor inactivo no figura entre activos", async () => {
    const { id } = await createSupplier({
      name: "Prov Del",
      code: "PROV-DEL",
      country: "ES",
    });
    await setSupplierActive(id, false);
    const list = await listSuppliers();
    expect(list.filter((s) => s.active).map((s) => s.id)).not.toContain(id);
    expect(await prisma.supplier.count({ where: { id } })).toBe(1);
  });
});

// ─── Compradores ───────────────────────────────────────────────────────────────

describe("Configuración — Compradores", () => {
  it("crea y lista un comprador (con holdedId)", async () => {
    const { id } = await createBuyer({
      name: "Comprador Config",
      code: "BUY-CFG",
      country: "IT",
      notes: "nota buyer",
      holdedId: "HLD-123",
    });
    const list = await listBuyers();
    const created = list.find((b) => b.id === id);
    expect(created).toBeDefined();
    expect(created?.country).toBe("IT");
    expect(created?.notes).toBe("nota buyer");
    expect(created?.holdedId).toBe("HLD-123");
    expect(created?.active).toBe(true);
  });

  it("edita un comprador", async () => {
    const { id } = await createBuyer({
      name: "Buyer A",
      code: "BUY-E",
      country: "ES",
    });
    await updateBuyer(id, {
      name: "Buyer B",
      code: "BUY-E",
      country: "DE",
      holdedId: "HLD-9",
    });
    const b = await prisma.buyer.findUniqueOrThrow({ where: { id } });
    expect(b.name).toBe("Buyer B");
    expect(b.country).toBe("DE");
    expect(b.holdedId).toBe("HLD-9");
  });

  it("soft-delete: comprador inactivo no figura entre activos", async () => {
    const { id } = await createBuyer({
      name: "Buyer Del",
      code: "BUY-DEL",
      country: "ES",
    });
    await setBuyerActive(id, false);
    const list = await listBuyers();
    expect(list.filter((b) => b.active).map((b) => b.id)).not.toContain(id);
    expect(await prisma.buyer.count({ where: { id } })).toBe(1);
  });
});

// ─── Transportistas ────────────────────────────────────────────────────────────

describe("Configuración — Transportistas", () => {
  it("crea y lista un transportista", async () => {
    const { id } = await createCarrier({ name: "Transportista Config" });
    const list = await listCarriers();
    const created = list.find((c) => c.id === id);
    expect(created).toBeDefined();
    expect(created?.name).toBe("Transportista Config");
    expect(created?.active).toBe(true);
  });

  it("edita un transportista", async () => {
    const { id } = await createCarrier({ name: "Carrier A" });
    await updateCarrier(id, { name: "Carrier B" });
    const c = await prisma.carrier.findUniqueOrThrow({ where: { id } });
    expect(c.name).toBe("Carrier B");
  });

  it("soft-delete: transportista inactivo no figura entre activos", async () => {
    const { id } = await createCarrier({ name: "Carrier Del" });
    await setCarrierActive(id, false);
    const list = await listCarriers();
    expect(list.filter((c) => c.active).map((c) => c.id)).not.toContain(id);
    expect(await prisma.carrier.count({ where: { id } })).toBe(1);
  });
});

// ─── Almacenes ─────────────────────────────────────────────────────────────────

describe("Configuración — Almacenes", () => {
  it("crea y lista un almacén (con conteo de sacas en zonas)", async () => {
    const { id } = await createWarehouse({
      name: "Almacén Config",
      code: "WH-CFG",
      location: "Nave 3",
    });
    const list = await listWarehouses();
    const created = list.find((w) => w.id === id);
    expect(created).toBeDefined();
    expect(created?.location).toBe("Nave 3");
    expect(created?.active).toBe(true);
    expect(created?.zones).toEqual([]);
  });

  it("edita un almacén", async () => {
    const { id } = await createWarehouse({ name: "WH A", code: "WH-E" });
    await updateWarehouse(id, {
      name: "WH B",
      code: "WH-E",
      location: "Nave 9",
    });
    const w = await prisma.warehouse.findUniqueOrThrow({ where: { id } });
    expect(w.name).toBe("WH B");
    expect(w.location).toBe("Nave 9");
  });

  it("soft-delete: almacén inactivo no figura entre activos", async () => {
    const { id } = await createWarehouse({ name: "WH Del", code: "WH-DEL" });
    await setWarehouseActive(id, false);
    const list = await listWarehouses();
    expect(list.filter((w) => w.active).map((w) => w.id)).not.toContain(id);
    expect(await prisma.warehouse.count({ where: { id } })).toBe(1);
  });
});

// ─── Zonas ─────────────────────────────────────────────────────────────────────

describe("Configuración — Zonas", () => {
  it("crea una zona en un almacén y aparece en el listado del almacén", async () => {
    const { id: zoneId } = await createZone({
      name: "Zona Nueva",
      code: "Z-NEW",
      maxCapacity: 300,
      warehouseId: base.warehouseId,
    });
    const list = await listWarehouses();
    const wh = list.find((w) => w.id === base.warehouseId);
    const zone = wh?.zones.find((z) => z.id === zoneId);
    expect(zone).toBeDefined();
    expect(zone?.maxCapacity).toBe(300);
    expect(zone?._count.sacks).toBe(0);
  });

  it("edita una zona", async () => {
    const { id } = await createZone({
      name: "Z Orig",
      code: "Z-EDIT",
      maxCapacity: 100,
      warehouseId: base.warehouseId,
    });
    await updateZone(id, {
      name: "Z Editada",
      code: "Z-EDIT2",
      maxCapacity: 250,
    });
    const z = await prisma.zone.findUniqueOrThrow({ where: { id } });
    expect(z.name).toBe("Z Editada");
    expect(z.code).toBe("Z-EDIT2");
    expect(z.maxCapacity).toBe(250);
  });

  it("borra una zona vacía (sin sacas)", async () => {
    const { id } = await createZone({
      name: "Z Vacía",
      code: "Z-EMPTY",
      maxCapacity: 50,
      warehouseId: base.warehouseId,
    });
    await deleteZone(id);
    expect(await prisma.zone.count({ where: { id } })).toBe(0);
  });

  it("rechaza el borrado de una zona con sacas asociadas", async () => {
    const { id: zoneId } = await createZone({
      name: "Z Con Sacas",
      code: "Z-FULL",
      maxCapacity: 50,
      warehouseId: base.warehouseId,
    });
    await prisma.sack.create({
      data: {
        qrCode: "SACK-CFG-1",
        weight: 1000,
        materialId: base.materialId,
        zoneId,
      },
    });

    await expect(deleteZone(zoneId)).rejects.toThrow();
    // La zona sigue existiendo.
    expect(await prisma.zone.count({ where: { id: zoneId } })).toBe(1);
  });
});
