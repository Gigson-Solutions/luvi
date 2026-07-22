import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import { logAudit } from "@/lib/services/audit.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Audit log — registro de acciones sensibles", () => {
  it("escribe una entrada con actor, acción, entidad y payload", async () => {
    await logAudit({
      userId: base.adminId,
      action: "CONFIRM_SHIPMENT",
      entity: "Shipment",
      entityId: "ship-123",
      payload: { reference: "EXP-0001" },
    });

    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.userId).toBe(base.adminId);
    expect(row.action).toBe("CONFIRM_SHIPMENT");
    expect(row.entity).toBe("Shipment");
    expect(row.entityId).toBe("ship-123");
    expect(row.payload).toEqual({ reference: "EXP-0001" });
    // Fuera de un contexto de request no hay cabeceras → IP nula.
    expect(row.ip).toBeNull();
  });

  it("admite acciones de sistema sin usuario (userId nulo)", async () => {
    await logAudit({ action: "SEED", entity: "System" });

    const row = await prisma.auditLog.findFirstOrThrow();
    expect(row.userId).toBeNull();
    expect(row.entityId).toBeNull();
  });

  it("nunca rompe la operativa: se traga los errores de escritura", async () => {
    // userId inexistente → viola la FK a users. logAudit NO debe propagar.
    await expect(
      logAudit({
        userId: "usuario-que-no-existe",
        action: "CREATE_SACK",
        entity: "Sack",
      }),
    ).resolves.toBeUndefined();

    // Y no deja ninguna fila a medias.
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("registra entradas independientes para cada acción", async () => {
    await logAudit({ userId: base.adminId, action: "A", entity: "Sack" });
    await logAudit({ userId: base.operarioId, action: "B", entity: "Lot" });

    const rows = await prisma.auditLog.findMany({ orderBy: { action: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["A", "B"]);
    expect(rows.map((r) => r.userId)).toEqual([base.adminId, base.operarioId]);
  });
});
