import { prisma } from "@/lib/prisma";

/**
 * Servicio de Coste — precio por tonelada de una saca de salida (lote final),
 * derivado del precio de compra (PurchaseOrder.pricePerTon) del material de
 * entrada que se consumió para producir su lote.
 *
 * Cadena: Sack (salida) → ProductionLot → Transformaciones → sacas de entrada
 *         → Container → ProviderShipment → PurchaseOrder.pricePerTon.
 *
 * Precio €/t de la saca final = coste total de compra de la entrada consumida
 * ÷ toneladas totales de salida del lote (reparto por peso).
 */

export interface SackCost {
  /** Hay al menos una saca de entrada con precio de compra conocido. */
  hasPrice: boolean;
  /** €/tonelada de la saca de salida (media ponderada de compra). */
  pricePerTon: number;
  sackWeightKg: number;
  /** Coste imputado a esta saca (€). */
  sackCost: number;
  /** TM de entrada consumidas por el lote. */
  inputTons: number;
  /** TM de salida del lote. */
  outputTons: number;
  /** % del peso de entrada que tenía precio de compra conocido. */
  pricedInputPct: number;
}

/**
 * Calcula el coste por tonelada de una saca de salida (con lote). Devuelve
 * `null` si la saca no existe o no es de salida (no tiene lote).
 */
export async function getFinalSackCost(
  sackId: string,
): Promise<SackCost | null> {
  const sack = await prisma.sack.findUnique({
    where: { id: sackId },
    select: { weight: true, lotId: true },
  });
  if (!sack || !sack.lotId) return null;

  // Sacas de entrada consumidas para producir el lote, con su precio de compra.
  const transformations = await prisma.transformation.findMany({
    where: { lotId: sack.lotId },
    select: {
      inputs: {
        select: {
          sack: {
            select: {
              weight: true,
              container: {
                select: {
                  providerShipment: {
                    select: {
                      purchaseOrder: { select: { pricePerTon: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  let inputKg = 0;
  let pricedKg = 0;
  let inputCost = 0;
  for (const t of transformations) {
    for (const inp of t.inputs) {
      const w = inp.sack.weight;
      inputKg += w;
      const ppt =
        inp.sack.container?.providerShipment?.purchaseOrder?.pricePerTon ??
        null;
      if (ppt != null) {
        pricedKg += w;
        inputCost += (w / 1000) * ppt;
      }
    }
  }

  // Toneladas de salida del lote (todas sus sacas).
  const outAgg = await prisma.sack.aggregate({
    where: { lotId: sack.lotId },
    _sum: { weight: true },
  });
  const outputKg = outAgg._sum.weight ?? 0;
  const outputTons = outputKg / 1000;

  const pricePerTon = outputTons > 0 ? inputCost / outputTons : 0;
  const sackCost = (sack.weight / 1000) * pricePerTon;

  return {
    hasPrice: pricedKg > 0,
    pricePerTon: Math.round(pricePerTon * 100) / 100,
    sackWeightKg: sack.weight,
    sackCost: Math.round(sackCost * 100) / 100,
    inputTons: Math.round((inputKg / 1000) * 1000) / 1000,
    outputTons: Math.round(outputTons * 1000) / 1000,
    pricedInputPct: inputKg > 0 ? Math.round((pricedKg / inputKg) * 100) : 0,
  };
}
