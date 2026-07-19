import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UserRole, MaterialType, ConsumableType } from "@prisma/client";

export { prisma };

// Orden no importa con CASCADE. Todas las tablas del schema (nombres @@map).
const TABLES = [
  "audit_logs",
  "incidents",
  "pallet_movements",
  "consumable_movements",
  "consumables",
  "quality_records",
  "provider_shipments",
  "purchase_orders",
  "shipment_sacks",
  "shipment_lots",
  "shipments",
  "transformation_inputs",
  "transformations",
  "production_lots",
  "sacks",
  "containers",
  "materials",
  "zones",
  "warehouses",
  "carriers",
  "buyers",
  "suppliers",
  "verification_tokens",
  "sessions",
  "accounts",
  "users",
];

/** Vacía todas las tablas (para aislar cada test). */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`,
  );
}

/** Hash SHA256 hex, idéntico a src/lib/auth.ts. */
export function sha256(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

export interface Baseline {
  adminId: string;
  operarioId: string;
  supplierId: string;
  buyerId: string;
  carrierId: string;
  materialId: string;
  warehouseId: string;
  zoneAId: string; // MP, capacidad 200
  zoneCId: string; // PT, capacidad 150
  palletConsumableId: string;
}

/** Inserta datos maestros mínimos y devuelve sus ids. */
export async function seedBaseline(): Promise<Baseline> {
  const admin = await prisma.user.create({
    data: {
      name: "Admin Test",
      email: "admin@test.local",
      password: sha256("admin123"),
      role: UserRole.ADMIN,
    },
  });
  const operario = await prisma.user.create({
    data: {
      name: "Operario Test",
      email: "op@test.local",
      password: sha256("op123"),
      role: UserRole.OPERARIO,
    },
  });
  const supplier = await prisma.supplier.create({
    data: { name: "Proveedor Test", code: "PROV-T1", country: "ES" },
  });
  const buyer = await prisma.buyer.create({
    data: { name: "Comprador Test", code: "BUY-T1", country: "ES" },
  });
  const carrier = await prisma.carrier.create({
    data: { name: "Transportista Test" },
  });
  const material = await prisma.material.create({
    data: {
      name: "Pellet PE Test",
      code: "PE-T1",
      type: MaterialType.PELLET_PE,
    },
  });
  const warehouse = await prisma.warehouse.create({
    data: {
      name: "Planta Test",
      code: "PLANTA-T",
      zones: {
        create: [
          { name: "Zona A", code: "A", maxCapacity: 200 },
          { name: "Zona C", code: "C", maxCapacity: 150 },
        ],
      },
    },
    include: { zones: { orderBy: { code: "asc" } } },
  });
  const pallet = await prisma.consumable.create({
    data: {
      type: ConsumableType.PALLET,
      name: "Pallet Test",
      currentStock: 100,
      minStock: 20,
    },
  });

  return {
    adminId: admin.id,
    operarioId: operario.id,
    supplierId: supplier.id,
    buyerId: buyer.id,
    carrierId: carrier.id,
    materialId: material.id,
    warehouseId: warehouse.id,
    zoneAId: warehouse.zones[0].id,
    zoneCId: warehouse.zones[1].id,
    palletConsumableId: pallet.id,
  };
}
