import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { LotType, SackStatus, ShipmentStatus } from "@prisma/client";
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
  confirmShipment,
  expediteShipment,
} from "@/lib/services/shipment.service";
import { traceSack } from "@/lib/services/traceability.service";

let base: Baseline;

interface Chain {
  containerId: string;
  inputSackId: string;
  inputSackQr: string;
  outputSackId: string;
  outputSackQr: string;
  lotId: string;
  lotNumber: string;
  shipmentId: string;
  shipmentReference: string;
}

/**
 * Monta una cadena de trazabilidad real con los servicios de negocio:
 *   contenedor (proveedor) → sacas de entrada → tolva/transformación →
 *   saca PT (lote) → envío expedido (comprador).
 */
async function buildChain(): Promise<Chain> {
  // 1) Recepción: contenedor pesado → 24 sacas de entrada EN_ALMACEN.
  const container = await registerContainer({
    reference: "CONT-TRACE-1",
    supplierId: base.supplierId,
    materialId: base.materialId,
  });
  await weighContainer({
    containerId: container.id,
    actualWeight: 24000,
    weightSource: "manual",
  });
  await confirmReception({
    containerId: container.id,
    materialId: base.materialId,
    zoneId: base.zoneAId,
    numSacks: 24,
  });

  const inputSacks = await prisma.sack.findMany({
    where: { containerId: container.id },
    orderBy: { batchNumber: "asc" },
  });
  const inputSack = inputSacks[0];

  // 2) Producción: entrada a tolva (abre transformación + lote PT del día).
  await enterHopper(inputSack.id, base.operarioId);

  // 3) Saca de salida PT — se acumula en el mismo lote PT del día/material.
  const { qrCode: outputQr, lotNumber } = await createOutputSack({
    type: LotType.PRODUCTO_TERMINADO,
    materialId: base.materialId,
    weight: 900,
    zoneId: base.zoneCId,
  });
  const outputSack = await prisma.sack.findFirstOrThrow({
    where: { qrCode: outputQr },
  });
  const lot = await prisma.productionLot.findFirstOrThrow({
    where: { lotNumber },
  });

  // 4) Expedición: crea envío con el lote → confirma → expide.
  const shipment = await createShipment({
    buyerId: base.buyerId,
    carrierId: base.carrierId,
    lots: [{ lotId: lot.id, weightKg: 900 }],
  });
  await confirmShipment(shipment.id);
  await expediteShipment(shipment.id);

  return {
    containerId: container.id,
    inputSackId: inputSack.id,
    inputSackQr: inputSack.qrCode,
    outputSackId: outputSack.id,
    outputSackQr: outputSack.qrCode,
    lotId: lot.id,
    lotNumber,
    shipmentId: shipment.id,
    shipmentReference: shipment.reference,
  };
}

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Trazabilidad — traceSack sobre cadena real recepción→producción→expedición", () => {
  it("saca de ENTRADA por qrCode: origen (contenedor→proveedor) y destino (lote+envío)", async () => {
    const chain = await buildChain();

    const trace = await traceSack(chain.inputSackQr);
    expect(trace).not.toBeNull();
    if (!trace) return;

    // Saca de entrada.
    expect(trace.sack.id).toBe(chain.inputSackId);
    expect(trace.sack.qrCode).toBe(chain.inputSackQr);
    expect(trace.sack.isOutput).toBe(false);
    expect(trace.sack.materialCode).toBe("PE-T1");

    // Hacia atrás: contenedor → proveedor.
    expect(trace.originContainer).not.toBeNull();
    expect(trace.originContainer?.reference).toBe("CONT-TRACE-1");
    expect(trace.originContainer?.supplierCode).toBe("PROV-T1");
    expect(trace.originContainer?.registeredAt).toBeInstanceOf(Date);
    expect(trace.originContainer?.arrivedAt).toBeInstanceOf(Date);

    // Una saca de entrada no procede de un lote.
    expect(trace.originLot).toBeNull();
    expect(trace.originTransformations).toHaveLength(0);

    // Hacia adelante: lote producido + envío (vía lote).
    expect(trace.producedLots.map((l) => l.lotNumber)).toContain(
      chain.lotNumber,
    );
    expect(trace.shipments).toHaveLength(1);
    const shipment = trace.shipments[0];
    expect(shipment.reference).toBe(chain.shipmentReference);
    expect(shipment.via).toBe("lote");
    expect(shipment.buyerCode).toBe("BUY-T1");
    expect(shipment.status).toBe(ShipmentStatus.EXPEDIDO);
    expect(shipment.expeditedAt).toBeInstanceOf(Date);
  });

  it("saca de ENTRADA por id: mismo resultado que por qrCode", async () => {
    const chain = await buildChain();

    const byId = await traceSack(chain.inputSackId);
    expect(byId).not.toBeNull();
    expect(byId?.sack.qrCode).toBe(chain.inputSackQr);
    expect(byId?.originContainer?.supplierCode).toBe("PROV-T1");
    expect(byId?.producedLots.map((l) => l.lotNumber)).toContain(
      chain.lotNumber,
    );
    expect(byId?.shipments.map((s) => s.reference)).toContain(
      chain.shipmentReference,
    );
  });

  it("saca de SALIDA (PT) por qrCode: origen (lote→transformación→sacas de entrada→contenedor) y destino (envío)", async () => {
    const chain = await buildChain();

    const trace = await traceSack(chain.outputSackQr);
    expect(trace).not.toBeNull();
    if (!trace) return;

    // Saca de salida.
    expect(trace.sack.id).toBe(chain.outputSackId);
    expect(trace.sack.isOutput).toBe(true);

    // Una saca de salida no tiene contenedor de origen directo.
    expect(trace.originContainer).toBeNull();

    // Hacia atrás: lote de origen.
    expect(trace.originLot).not.toBeNull();
    expect(trace.originLot?.lotNumber).toBe(chain.lotNumber);
    expect(trace.originLot?.type).toBe(LotType.PRODUCTO_TERMINADO);

    // Transformación que produjo el lote + sacas de entrada consumidas.
    expect(trace.originTransformations).toHaveLength(1);
    const transformation = trace.originTransformations[0];
    expect(transformation.inputs).toHaveLength(1);
    const input = transformation.inputs[0];
    expect(input.id).toBe(chain.inputSackId);
    expect(input.qrCode).toBe(chain.inputSackQr);
    // De la saca de entrada consumida se llega a su contenedor y proveedor.
    expect(input.container).not.toBeNull();
    expect(input.container?.reference).toBe("CONT-TRACE-1");
    expect(input.container?.supplierCode).toBe("PROV-T1");

    // Hacia adelante: envío del lote (vía lote) → comprador.
    expect(trace.shipments).toHaveLength(1);
    const shipment = trace.shipments[0];
    expect(shipment.reference).toBe(chain.shipmentReference);
    expect(shipment.via).toBe("lote");
    expect(shipment.buyerCode).toBe("BUY-T1");
    expect(shipment.status).toBe(ShipmentStatus.EXPEDIDO);
  });

  it("saca de SALIDA por id: mismo resultado que por qrCode", async () => {
    const chain = await buildChain();

    const byId = await traceSack(chain.outputSackId);
    expect(byId).not.toBeNull();
    expect(byId?.sack.qrCode).toBe(chain.outputSackQr);
    expect(byId?.originLot?.lotNumber).toBe(chain.lotNumber);
    expect(byId?.originTransformations).toHaveLength(1);
    expect(byId?.shipments.map((s) => s.reference)).toContain(
      chain.shipmentReference,
    );
  });

  it("saca de entrada aún no procesada: sin lote ni envío hacia adelante", async () => {
    // Solo recepción, sin producción ni expedición.
    const container = await registerContainer({
      reference: "CONT-TRACE-SOLO",
      supplierId: base.supplierId,
    });
    await weighContainer({ containerId: container.id, actualWeight: 10000 });
    await confirmReception({
      containerId: container.id,
      materialId: base.materialId,
      zoneId: base.zoneAId,
      numSacks: 10,
    });
    const sack = await prisma.sack.findFirstOrThrow({
      where: { containerId: container.id },
    });

    const trace = await traceSack(sack.qrCode);
    expect(trace).not.toBeNull();
    expect(trace?.sack.isOutput).toBe(false);
    expect(trace?.sack.status).toBe(SackStatus.EN_ALMACEN);
    expect(trace?.originContainer?.reference).toBe("CONT-TRACE-SOLO");
    expect(trace?.producedLots).toHaveLength(0);
    expect(trace?.shipments).toHaveLength(0);
  });

  it("query inexistente devuelve null", async () => {
    await buildChain();
    expect(await traceSack("NO-EXISTE-QR")).toBeNull();
    expect(await traceSack("clu1d0000000000000000000")).toBeNull();
  });

  it("query vacía (o solo espacios) devuelve null", async () => {
    expect(await traceSack("")).toBeNull();
    expect(await traceSack("   ")).toBeNull();
  });
});
