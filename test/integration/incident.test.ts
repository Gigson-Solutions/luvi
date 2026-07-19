import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { IncidentStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createIncident,
  advanceIncidentStatus,
  listIncidents,
  getIncidentStats,
} from "@/lib/services/incident.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Incidencias — creación", () => {
  it("crea una incidencia en estado inicial ABIERTA", async () => {
    const inc = await createIncident({
      title: "Saca rota en zona A",
      description: "La saca presenta un roto en la base",
      warehouseId: base.warehouseId,
      sackQrCode: "SACK-0001",
      reportedById: base.adminId,
    });

    expect(inc.status).toBe(IncidentStatus.ABIERTA);
    expect(inc.title).toBe("Saca rota en zona A");
    expect(inc.description).toBe("La saca presenta un roto en la base");
    expect(inc.warehouseId).toBe(base.warehouseId);
    expect(inc.sackQrCode).toBe("SACK-0001");
    expect(inc.reportedById).toBe(base.adminId);
    expect(inc.resolvedAt).toBeNull();
    expect(inc.closedAt).toBeNull();
    // include del reporter
    expect(inc.reportedBy.id).toBe(base.adminId);
    expect(inc.reportedBy.name).toBe("Admin Test");
  });

  it("crea una incidencia mínima (solo title + reportedById) con campos opcionales a null", async () => {
    const inc = await createIncident({
      title: "Incidencia sin detalles",
      reportedById: base.operarioId,
    });

    expect(inc.status).toBe(IncidentStatus.ABIERTA);
    expect(inc.description).toBeNull();
    expect(inc.warehouseId).toBeNull();
    expect(inc.sackQrCode).toBeNull();
    expect(inc.photoUrl).toBeNull();
    expect(inc.reportedById).toBe(base.operarioId);
  });
});

describe("Incidencias — ciclo de vida", () => {
  it("avanza ABIERTA → EN_REVISION → EN_PROCESO → RESUELTA → CERRADA sellando timestamps", async () => {
    const inc = await createIncident({
      title: "Ciclo completo",
      warehouseId: base.warehouseId,
      reportedById: base.adminId,
    });
    expect(inc.status).toBe(IncidentStatus.ABIERTA);

    const revision = await advanceIncidentStatus(inc.id);
    expect(revision.status).toBe(IncidentStatus.EN_REVISION);
    expect(revision.resolvedAt).toBeNull();
    expect(revision.closedAt).toBeNull();

    const proceso = await advanceIncidentStatus(inc.id);
    expect(proceso.status).toBe(IncidentStatus.EN_PROCESO);
    expect(proceso.resolvedAt).toBeNull();
    expect(proceso.closedAt).toBeNull();

    const resuelta = await advanceIncidentStatus(inc.id);
    expect(resuelta.status).toBe(IncidentStatus.RESUELTA);
    expect(resuelta.resolvedAt).toBeInstanceOf(Date);
    expect(resuelta.closedAt).toBeNull();

    const cerrada = await advanceIncidentStatus(inc.id);
    expect(cerrada.status).toBe(IncidentStatus.CERRADA);
    expect(cerrada.closedAt).toBeInstanceOf(Date);
    // resolvedAt se conserva tras cerrar
    expect(cerrada.resolvedAt).toBeInstanceOf(Date);
    expect(cerrada.resolvedAt?.getTime()).toBe(resuelta.resolvedAt?.getTime());
  });

  it("no permite avanzar una incidencia ya CERRADA", async () => {
    const inc = await createIncident({
      title: "A cerrar",
      reportedById: base.adminId,
    });
    await advanceIncidentStatus(inc.id); // EN_REVISION
    await advanceIncidentStatus(inc.id); // EN_PROCESO
    await advanceIncidentStatus(inc.id); // RESUELTA
    const cerrada = await advanceIncidentStatus(inc.id); // CERRADA
    expect(cerrada.status).toBe(IncidentStatus.CERRADA);

    await expect(advanceIncidentStatus(inc.id)).rejects.toThrow();
  });

  it("lanza si la incidencia no existe", async () => {
    await expect(advanceIncidentStatus("no-existe-id")).rejects.toThrow();
  });
});

describe("Incidencias — listado y filtros", () => {
  it("lista todas y filtra por estado", async () => {
    const abierta = await createIncident({
      title: "Abierta 1",
      reportedById: base.adminId,
    });
    const otra = await createIncident({
      title: "Abierta 2",
      reportedById: base.adminId,
    });
    await advanceIncidentStatus(otra.id); // EN_REVISION

    const todas = await listIncidents();
    expect(todas).toHaveLength(2);

    const abiertas = await listIncidents({ status: IncidentStatus.ABIERTA });
    expect(abiertas.map((i) => i.id)).toEqual([abierta.id]);

    const enRevision = await listIncidents({
      status: IncidentStatus.EN_REVISION,
    });
    expect(enRevision.map((i) => i.id)).toEqual([otra.id]);

    const cerradas = await listIncidents({ status: IncidentStatus.CERRADA });
    expect(cerradas).toHaveLength(0);
  });

  it("filtra por almacén", async () => {
    const enWh = await createIncident({
      title: "En almacén",
      warehouseId: base.warehouseId,
      reportedById: base.adminId,
    });
    await createIncident({
      title: "Otro almacén",
      warehouseId: "otro-wh-id",
      reportedById: base.adminId,
    });
    await createIncident({ title: "Sin almacén", reportedById: base.adminId });

    const delAlmacen = await listIncidents({ warehouseId: base.warehouseId });
    expect(delAlmacen.map((i) => i.id)).toEqual([enWh.id]);
  });

  it("combina filtro de estado y almacén", async () => {
    const target = await createIncident({
      title: "Target",
      warehouseId: base.warehouseId,
      reportedById: base.adminId,
    });
    // misma warehouse pero avanzada de estado
    const avanzada = await createIncident({
      title: "Avanzada",
      warehouseId: base.warehouseId,
      reportedById: base.adminId,
    });
    await advanceIncidentStatus(avanzada.id);

    const res = await listIncidents({
      status: IncidentStatus.ABIERTA,
      warehouseId: base.warehouseId,
    });
    expect(res.map((i) => i.id)).toEqual([target.id]);
  });

  it("ordena por createdAt descendente (más reciente primero)", async () => {
    const primera = await createIncident({
      title: "Primera",
      reportedById: base.adminId,
    });
    // pequeño delay para asegurar distinto createdAt
    await new Promise((r) => setTimeout(r, 10));
    const segunda = await createIncident({
      title: "Segunda",
      reportedById: base.adminId,
    });

    const todas = await listIncidents();
    expect(todas.map((i) => i.id)).toEqual([segunda.id, primera.id]);
  });
});

describe("Incidencias — estadísticas por estado", () => {
  it("devuelve el recuento por cada estado con ceros por defecto", async () => {
    const stats = await getIncidentStats();
    expect(stats).toEqual({
      ABIERTA: 0,
      EN_REVISION: 0,
      EN_PROCESO: 0,
      RESUELTA: 0,
      CERRADA: 0,
    });
  });

  it("cuenta correctamente incidencias en distintos estados", async () => {
    // 2 ABIERTA
    await createIncident({ title: "A1", reportedById: base.adminId });
    await createIncident({ title: "A2", reportedById: base.adminId });
    // 1 EN_REVISION
    const rev = await createIncident({
      title: "R1",
      reportedById: base.adminId,
    });
    await advanceIncidentStatus(rev.id);
    // 1 RESUELTA
    const res = await createIncident({
      title: "Res1",
      reportedById: base.adminId,
    });
    await advanceIncidentStatus(res.id); // EN_REVISION
    await advanceIncidentStatus(res.id); // EN_PROCESO
    await advanceIncidentStatus(res.id); // RESUELTA

    const stats = await getIncidentStats();
    expect(stats.ABIERTA).toBe(2);
    expect(stats.EN_REVISION).toBe(1);
    expect(stats.EN_PROCESO).toBe(0);
    expect(stats.RESUELTA).toBe(1);
    expect(stats.CERRADA).toBe(0);
  });
});
