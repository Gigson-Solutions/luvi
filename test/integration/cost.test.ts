import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { LotType, SackStatus } from "@prisma/client";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import { getFinalSackCost } from "@/lib/services/cost.service";

let base: Baseline;
let seq = 0;
const uid = (): string => `c${++seq}`;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

interface InputSpec {
  weightKg: number;
  /** €/t de compra; null = saca de entrada sin precio conocido. */
  pricePerTon: number | null;
}

/**
 * Monta la cadena de coste: sacas de entrada (con/sin precio de compra) →
 * Transformation → ProductionLot → sacas de salida. Devuelve los ids.
 */
async function buildLot(opts: {
  inputs: InputSpec[];
  outputs: number[]; // pesos (kg) de las sacas de salida
}): Promise<{
  lotId: string;
  outputSackIds: string[];
  inputSackIds: string[];
}> {
  const lot = await prisma.productionLot.create({
    data: {
      lotNumber: `LOTE-${uid()}`,
      type: LotType.PRODUCTO_TERMINADO,
      materialId: base.materialId,
    },
  });
  const transformation = await prisma.transformation.create({
    data: { lotId: lot.id, operatorId: base.operarioId },
  });

  const inputSackIds: string[] = [];
  for (const inp of opts.inputs) {
    let providerShipmentId: string | undefined;
    if (inp.pricePerTon != null) {
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber: `PO-${uid()}`,
          supplierId: base.supplierId,
          orderedTons: 100,
          pricePerTon: inp.pricePerTon,
        },
      });
      const shipment = await prisma.providerShipment.create({
        data: { purchaseOrderId: po.id },
      });
      providerShipmentId = shipment.id;
    }
    const container = await prisma.container.create({
      data: {
        reference: `CONT-${uid()}`,
        supplierId: base.supplierId,
        materialId: base.materialId,
        providerShipmentId,
      },
    });
    const sack = await prisma.sack.create({
      data: {
        qrCode: `IN-${uid()}`,
        weight: inp.weightKg,
        materialId: base.materialId,
        status: SackStatus.EN_PRODUCCION,
        containerId: container.id,
      },
    });
    inputSackIds.push(sack.id);
    await prisma.transformationInput.create({
      data: { transformationId: transformation.id, sackId: sack.id },
    });
  }

  const outputSackIds: string[] = [];
  for (const w of opts.outputs) {
    const sack = await prisma.sack.create({
      data: {
        qrCode: `OUT-${uid()}`,
        weight: w,
        materialId: base.materialId,
        status: SackStatus.PRODUCTO_TERMINADO,
        lotId: lot.id,
      },
    });
    outputSackIds.push(sack.id);
  }

  return { lotId: lot.id, outputSackIds, inputSackIds };
}

describe("Coste — €/t de la saca de salida", () => {
  it("reparte el coste de compra sobre las TM de salida (con merma)", async () => {
    // 2000 kg de entrada a 300 €/t = 600 € → 1500 kg de salida → 400 €/t
    const { outputSackIds } = await buildLot({
      inputs: [
        { weightKg: 1000, pricePerTon: 300 },
        { weightKg: 1000, pricePerTon: 300 },
      ],
      outputs: [1500],
    });

    const cost = await getFinalSackCost(outputSackIds[0]);
    expect(cost).not.toBeNull();
    expect(cost!.hasPrice).toBe(true);
    expect(cost!.pricePerTon).toBe(400);
    expect(cost!.sackWeightKg).toBe(1500);
    expect(cost!.sackCost).toBe(600);
    expect(cost!.inputTons).toBe(2);
    expect(cost!.outputTons).toBe(1.5);
    expect(cost!.pricedInputPct).toBe(100);
  });

  it("imputa el coste a cada saca de salida por su peso", async () => {
    // 2000 kg @ 300 €/t = 600 € → salida 1000 + 500 kg → 400 €/t
    const { outputSackIds } = await buildLot({
      inputs: [{ weightKg: 2000, pricePerTon: 300 }],
      outputs: [1000, 500],
    });

    const big = await getFinalSackCost(outputSackIds[0]);
    const small = await getFinalSackCost(outputSackIds[1]);
    expect(big!.pricePerTon).toBe(400);
    expect(big!.sackCost).toBe(400); // 1.0 t × 400
    expect(small!.pricePerTon).toBe(400);
    expect(small!.sackCost).toBe(200); // 0.5 t × 400
  });

  it("solo cuenta el coste de la entrada con precio conocido (parcial)", async () => {
    // 1000 kg @ 300 + 1000 kg sin precio = 300 € → 1500 kg salida → 200 €/t
    const { outputSackIds } = await buildLot({
      inputs: [
        { weightKg: 1000, pricePerTon: 300 },
        { weightKg: 1000, pricePerTon: null },
      ],
      outputs: [1500],
    });

    const cost = await getFinalSackCost(outputSackIds[0]);
    expect(cost!.hasPrice).toBe(true);
    expect(cost!.pricePerTon).toBe(200);
    expect(cost!.pricedInputPct).toBe(50);
  });

  it("sin ninguna entrada con precio → hasPrice false y coste 0", async () => {
    const { outputSackIds } = await buildLot({
      inputs: [{ weightKg: 1000, pricePerTon: null }],
      outputs: [800],
    });

    const cost = await getFinalSackCost(outputSackIds[0]);
    expect(cost!.hasPrice).toBe(false);
    expect(cost!.pricePerTon).toBe(0);
    expect(cost!.sackCost).toBe(0);
    expect(cost!.pricedInputPct).toBe(0);
  });

  it("devuelve null si la saca no existe o no es de salida (sin lote)", async () => {
    const { inputSackIds } = await buildLot({
      inputs: [{ weightKg: 1000, pricePerTon: 300 }],
      outputs: [900],
    });

    expect(await getFinalSackCost("no-existe")).toBeNull();
    // una saca de entrada no tiene lote → no es saca de salida
    expect(await getFinalSackCost(inputSackIds[0])).toBeNull();
  });
});
