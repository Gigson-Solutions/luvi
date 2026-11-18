import { prisma } from "@/lib/prisma";
import { MaterialKind, Prisma, SackStatus } from "@prisma/client";
import { sackSupplier, sackSupplierIn } from "@/lib/sack-supplier";

/**
 * Valoración del inventario de materia prima a COSTE (no a precio de venta).
 *
 * Cada saca en almacén se valora a un €/t:
 *   1. Si viene de un pedido: coste puesto en planta de su embarque = precio de
 *      la mercancía + gastos del pedido repartidos por tonelada (ver
 *      `shipmentCostPerTon`).
 *   2. Si no (altas manuales, stock inicial): el precio que se haya fijado para
 *      su proveedor y producto (`SupplierMaterialPrice`).
 *   3. Si no hay ninguno, la saca queda "sin precio": cuenta en toneladas pero no
 *      entra en la media, para no falsearla con ceros.
 *
 * Se agrupa por Tipo de material (p. ej. «Materia prima caliente» / «Materia
 * prima fría»): el precio medio ponderado de cada grupo es Σ(€) / Σ(t con precio).
 */

export interface ValuationFilters {
  supplierIds: string[];
  warehouseIds: string[];
  materialIds: string[];
  categoryIds: string[];
}

export interface ShipmentCostInput {
  pricePerTon: number | null;
  oceanFreightPerContainer: number | null;
  arrivalCostsPerContainer: number | null;
  arrivalCostsPerShipment: number | null;
  deliveryTransportPerContainer: number | null;
  additionalCostsPerShipment: number | null;
  customsDuties: number | null;
}

/**
 * Coste por tonelada de un embarque, puesto en planta:
 *   mercancía (€/t)
 *   + [ (flete + llegada + entrega) × nº contenedores
 *       + (llegada + adicionales) por embarque
 *       + aranceles × (t del embarque ÷ t de todos los embarques del pedido) ] ÷ t
 * Devuelve null si el pedido no tiene precio de mercancía o el embarque no pesa.
 */
export function shipmentCostPerTon(
  order: ShipmentCostInput,
  shipmentTons: number,
  orderTons: number,
  containerCount: number,
): number | null {
  if (order.pricePerTon == null || shipmentTons <= 0) return null;
  const perContainer =
    (order.oceanFreightPerContainer ?? 0) +
    (order.arrivalCostsPerContainer ?? 0) +
    (order.deliveryTransportPerContainer ?? 0);
  const perShipment =
    (order.arrivalCostsPerShipment ?? 0) +
    (order.additionalCostsPerShipment ?? 0);
  const customsShare =
    orderTons > 0 ? (order.customsDuties ?? 0) * (shipmentTons / orderTons) : 0;
  const extras = perContainer * containerCount + perShipment + customsShare;
  return order.pricePerTon + extras / shipmentTons;
}

export interface SupplierValuation {
  supplierId: string | null;
  supplier: string;
  sacks: number;
  tons: number;
  pricedTons: number;
  /** € totales de las sacas con precio. */
  value: number;
  /** €/t medio de este proveedor dentro del grupo; null si ninguna saca tiene precio. */
  avgPerTon: number | null;
  unpricedSacks: number;
}

export interface CategoryValuation {
  categoryId: string | null;
  category: string;
  sacks: number;
  tons: number;
  pricedTons: number;
  value: number;
  /** €/t medio ponderado de todo el grupo; null si ninguna saca tiene precio. */
  avgPerTon: number | null;
  unpricedSacks: number;
  suppliers: SupplierValuation[];
}

export interface InventoryValuation {
  categories: CategoryValuation[];
  totals: {
    sacks: number;
    tons: number;
    value: number;
    unpricedSacks: number;
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Tipos de salida; todo lo demás (incluidos «caliente» y «fría») es materia prima. */
const OUTPUT_KINDS: MaterialKind[] = [
  MaterialKind.PRODUCTO_TERMINADO,
  MaterialKind.SUBPRODUCTO,
  MaterialKind.RECHAZO,
];

/** Productos que son materia prima de entrada (no de salida). */
const INPUT_MATERIAL: Prisma.MaterialWhereInput = {
  OR: [
    { category: { is: { kind: { notIn: OUTPUT_KINDS } } } },
    { categoryId: null },
  ],
};

interface Bucket {
  sacks: number;
  tons: number;
  pricedTons: number;
  value: number;
  unpricedSacks: number;
}

function emptyBucket(): Bucket {
  return { sacks: 0, tons: 0, pricedTons: 0, value: 0, unpricedSacks: 0 };
}

function add(b: Bucket, tons: number, perTon: number | null): void {
  b.sacks += 1;
  b.tons += tons;
  if (perTon == null) {
    b.unpricedSacks += 1;
  } else {
    b.pricedTons += tons;
    b.value += tons * perTon;
  }
}

function avg(b: Bucket): number | null {
  return b.pricedTons > 0 ? round2(b.value / b.pricedTons) : null;
}

/**
 * Valora la materia prima en almacén (sacas de entrada EN_ALMACEN) y la agrupa
 * por Tipo de material y, dentro, por proveedor.
 */
export async function getInventoryValuation(
  filters: ValuationFilters = {
    supplierIds: [],
    warehouseIds: [],
    materialIds: [],
    categoryIds: [],
  },
): Promise<InventoryValuation> {
  const sacks = await prisma.sack.findMany({
    where: {
      status: SackStatus.EN_ALMACEN,
      lotId: null,
      material: {
        is: {
          AND: [
            INPUT_MATERIAL,
            ...(filters.categoryIds.length > 0
              ? [{ categoryId: { in: filters.categoryIds } }]
              : []),
          ],
        },
      },
      ...(filters.materialIds.length > 0
        ? { materialId: { in: filters.materialIds } }
        : {}),
      ...(filters.warehouseIds.length > 0
        ? { zone: { is: { warehouseId: { in: filters.warehouseIds } } } }
        : {}),
      ...(filters.supplierIds.length > 0
        ? { AND: [sackSupplierIn(filters.supplierIds)] }
        : {}),
    },
    select: {
      weight: true,
      materialId: true,
      material: {
        select: { category: { select: { id: true, name: true } } },
      },
      supplier: { select: { id: true, name: true } },
      container: {
        select: {
          providerShipmentId: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Embarques de esas sacas y todos los embarques de sus pedidos (los aranceles
  // se reparten entre ellos).
  const shipmentIds = [
    ...new Set(
      sacks
        .map((s) => s.container?.providerShipmentId)
        .filter((id): id is string => !!id),
    ),
  ];
  const seed = await prisma.providerShipment.findMany({
    where: { id: { in: shipmentIds } },
    select: { purchaseOrderId: true },
  });
  const orderIds = [
    ...new Set(
      seed.map((s) => s.purchaseOrderId).filter((id): id is string => !!id),
    ),
  ];
  const shipments = await prisma.providerShipment.findMany({
    where: {
      OR: [{ id: { in: shipmentIds } }, { purchaseOrderId: { in: orderIds } }],
    },
    select: {
      id: true,
      purchaseOrderId: true,
      weightKg: true,
      containers: { select: { actualWeight: true, expectedWeight: true } },
      purchaseOrder: {
        select: {
          pricePerTon: true,
          oceanFreightPerContainer: true,
          arrivalCostsPerContainer: true,
          arrivalCostsPerShipment: true,
          deliveryTransportPerContainer: true,
          additionalCostsPerShipment: true,
          customsDuties: true,
        },
      },
    },
  });

  /** Toneladas de un embarque: su peso, o el de sus contenedores. */
  const tonsOf = (s: (typeof shipments)[number]): number => {
    if (s.weightKg != null && s.weightKg > 0) return s.weightKg / 1000;
    const kg = s.containers.reduce(
      (n, c) => n + (c.actualWeight ?? c.expectedWeight ?? 0),
      0,
    );
    return kg / 1000;
  };
  const tonsByOrder = new Map<string, number>();
  for (const s of shipments) {
    if (!s.purchaseOrderId) continue;
    tonsByOrder.set(
      s.purchaseOrderId,
      (tonsByOrder.get(s.purchaseOrderId) ?? 0) + tonsOf(s),
    );
  }
  const costByShipment = new Map<string, number | null>();
  for (const s of shipments) {
    costByShipment.set(
      s.id,
      s.purchaseOrder
        ? shipmentCostPerTon(
            s.purchaseOrder,
            tonsOf(s),
            tonsByOrder.get(s.purchaseOrderId ?? "") ?? 0,
            s.containers.length,
          )
        : null,
    );
  }

  // Precios de respaldo por proveedor y producto.
  const fallbackRows = await prisma.supplierMaterialPrice.findMany();
  const fallback = new Map(
    fallbackRows.map((p) => [`${p.supplierId}|${p.materialId}`, p.pricePerTon]),
  );

  const groups = new Map<
    string,
    {
      categoryId: string | null;
      category: string;
      total: Bucket;
      suppliers: Map<
        string,
        { supplierId: string | null; supplier: string; b: Bucket }
      >;
    }
  >();
  const grand = emptyBucket();

  for (const s of sacks) {
    const supplier = sackSupplier(s);
    const tons = s.weight / 1000;
    const shipmentId = s.container?.providerShipmentId;
    const perTon =
      (shipmentId ? costByShipment.get(shipmentId) : null) ??
      (supplier ? fallback.get(`${supplier.id}|${s.materialId}`) : null) ??
      null;

    const cat = s.material.category;
    const key = cat?.id ?? "sin-tipo";
    const g = groups.get(key) ?? {
      categoryId: cat?.id ?? null,
      category: cat?.name ?? "Sin tipo",
      total: emptyBucket(),
      suppliers: new Map(),
    };
    add(g.total, tons, perTon);
    const sKey = supplier?.id ?? "sin-proveedor";
    const sup = g.suppliers.get(sKey) ?? {
      supplierId: supplier?.id ?? null,
      supplier: supplier?.name ?? "Sin proveedor",
      b: emptyBucket(),
    };
    add(sup.b, tons, perTon);
    g.suppliers.set(sKey, sup);
    groups.set(key, g);
    add(grand, tons, perTon);
  }

  const categories: CategoryValuation[] = [...groups.values()]
    .map((g) => ({
      categoryId: g.categoryId,
      category: g.category,
      sacks: g.total.sacks,
      tons: round3(g.total.tons),
      pricedTons: round3(g.total.pricedTons),
      value: round2(g.total.value),
      avgPerTon: avg(g.total),
      unpricedSacks: g.total.unpricedSacks,
      suppliers: [...g.suppliers.values()]
        .map((x) => ({
          supplierId: x.supplierId,
          supplier: x.supplier,
          sacks: x.b.sacks,
          tons: round3(x.b.tons),
          pricedTons: round3(x.b.pricedTons),
          value: round2(x.b.value),
          avgPerTon: avg(x.b),
          unpricedSacks: x.b.unpricedSacks,
        }))
        .sort((a, b) => b.tons - a.tons),
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "es"));

  return {
    categories,
    totals: {
      sacks: grand.sacks,
      tons: round3(grand.tons),
      value: round2(grand.value),
      unpricedSacks: grand.unpricedSacks,
    },
  };
}

/** Precios de respaldo fijados, con nombres, para editarlos. */
export async function listSupplierMaterialPrices(): Promise<
  {
    supplierId: string;
    supplier: string;
    materialId: string;
    material: string;
    pricePerTon: number;
  }[]
> {
  const rows = await prisma.supplierMaterialPrice.findMany({
    include: {
      supplier: { select: { name: true } },
      material: { select: { name: true } },
    },
    orderBy: [{ supplier: { name: "asc" } }, { material: { name: "asc" } }],
  });
  return rows.map((r) => ({
    supplierId: r.supplierId,
    supplier: r.supplier.name,
    materialId: r.materialId,
    material: r.material.name,
    pricePerTon: r.pricePerTon,
  }));
}

/**
 * Combinaciones proveedor + producto con stock en almacén y alguna saca sin
 * precio de pedido: las que necesitan un precio de respaldo.
 */
export async function listPriceGaps(): Promise<
  {
    supplierId: string;
    supplier: string;
    materialId: string;
    material: string;
    sacks: number;
    tons: number;
    pricePerTon: number | null;
  }[]
> {
  const sacks = await prisma.sack.findMany({
    where: {
      status: SackStatus.EN_ALMACEN,
      lotId: null,
      containerId: null,
      supplierId: { not: null },
      material: { is: INPUT_MATERIAL },
    },
    select: {
      weight: true,
      materialId: true,
      supplierId: true,
      supplier: { select: { name: true } },
      material: { select: { name: true } },
    },
  });
  const prices = new Map(
    (await prisma.supplierMaterialPrice.findMany()).map((p) => [
      `${p.supplierId}|${p.materialId}`,
      p.pricePerTon,
    ]),
  );
  const map = new Map<
    string,
    {
      supplierId: string;
      supplier: string;
      materialId: string;
      material: string;
      sacks: number;
      tons: number;
      pricePerTon: number | null;
    }
  >();
  for (const s of sacks) {
    if (!s.supplierId) continue;
    const key = `${s.supplierId}|${s.materialId}`;
    const e = map.get(key) ?? {
      supplierId: s.supplierId,
      supplier: s.supplier?.name ?? "",
      materialId: s.materialId,
      material: s.material.name,
      sacks: 0,
      tons: 0,
      pricePerTon: prices.get(key) ?? null,
    };
    e.sacks += 1;
    e.tons += s.weight / 1000;
    map.set(key, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, tons: round3(e.tons) }))
    .sort((a, b) => a.supplier.localeCompare(b.supplier, "es"));
}

/** Fija (o borra, con null) el precio de respaldo de un proveedor y producto. */
export async function setSupplierMaterialPrice(
  supplierId: string,
  materialId: string,
  pricePerTon: number | null,
): Promise<void> {
  if (pricePerTon == null) {
    await prisma.supplierMaterialPrice.deleteMany({
      where: { supplierId, materialId },
    });
    return;
  }
  if (!Number.isFinite(pricePerTon) || pricePerTon < 0) {
    throw new Error("El precio debe ser un número igual o mayor que 0.");
  }
  await prisma.supplierMaterialPrice.upsert({
    where: { supplierId_materialId: { supplierId, materialId } },
    create: { supplierId, materialId, pricePerTon },
    update: { pricePerTon },
  });
}
