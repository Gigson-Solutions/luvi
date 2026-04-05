import { PrismaClient, UserRole, MaterialType, ConsumableType } from "@prisma/client";
import { hash } from "crypto";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  // En producción usar bcrypt — aquí SHA256 solo para seed
  return hash("sha256", password);
}

async function main() {
  console.log("🌱 Iniciando seed...");

  // ─── Usuarios ─────────────────────────────────────────────────────────────
  const adminPassword = await hashPassword("admin123");
  const admin = await prisma.user.upsert({
    where: { email: "admin@luvi2000.es" },
    update: {},
    create: {
      name: "Administrador",
      email: "admin@luvi2000.es",
      password: adminPassword,
      role: UserRole.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: "laura@luvi2000.es" },
    update: {},
    create: {
      name: "Laura",
      email: "laura@luvi2000.es",
      password: await hashPassword("operario123"),
      role: UserRole.OPERARIO,
    },
  });

  await prisma.user.upsert({
    where: { email: "paula@luvi2000.es" },
    update: {},
    create: {
      name: "Paula Pascual",
      email: "paula@luvi2000.es",
      password: await hashPassword("admin123"),
      role: UserRole.ADMINISTRACION,
    },
  });

  console.log("✅ Usuarios creados");

  // ─── Materiales ───────────────────────────────────────────────────────────
  const materials = [
    { name: "Pellet PE Natural", code: "PE-NAT", type: MaterialType.PELLET_PE },
    { name: "Pellet PE Color", code: "PE-COL", type: MaterialType.PELLET_PE },
    { name: "Pellet PP Natural", code: "PP-NAT", type: MaterialType.PELLET_PP },
    { name: "Film PE", code: "FILM-PE", type: MaterialType.FILM_PE },
    { name: "Rígido Mixto", code: "RIG-MIX", type: MaterialType.RIGIDO_MIXTO },
  ];

  for (const mat of materials) {
    await prisma.material.upsert({
      where: { code: mat.code },
      update: {},
      create: mat,
    });
  }

  console.log("✅ Materiales creados");

  // ─── Proveedores ──────────────────────────────────────────────────────────
  const suppliers = [
    { name: "Proveedor ES Ejemplo", code: "PROV-ES-01", country: "ES" },
    { name: "Supplier UK Ltd", code: "PROV-UK-01", country: "GB" },
    { name: "Fournisseur France", code: "PROV-FR-01", country: "FR" },
  ];

  for (const sup of suppliers) {
    await prisma.supplier.upsert({
      where: { code: sup.code },
      update: {},
      create: sup,
    });
  }

  console.log("✅ Proveedores creados");

  // ─── Almacenes y zonas ────────────────────────────────────────────────────
  const planta = await prisma.warehouse.upsert({
    where: { code: "MONTALBOS" },
    update: {},
    create: {
      name: "Planta Montalbos",
      code: "MONTALBOS",
      location: "Montalbos, Cuenca",
      zones: {
        create: [
          { name: "Zona A — MP", code: "A", maxCapacity: 200 },
          { name: "Zona B — MP", code: "B", maxCapacity: 200 },
          { name: "Zona C — PT", code: "C", maxCapacity: 150 },
          { name: "Zona D — PT", code: "D", maxCapacity: 150 },
          { name: "Zona Rechazo", code: "RCH", maxCapacity: 50 },
        ],
      },
    },
  });

  console.log("✅ Almacenes y zonas creados");

  // ─── Compradores ──────────────────────────────────────────────────────────
  const buyers = [
    { name: "Comprador Ejemplo ES", code: "BUY-ES-01" },
    { name: "Buyer Germany GmbH", code: "BUY-DE-01" },
  ];

  for (const buyer of buyers) {
    await prisma.buyer.upsert({
      where: { code: buyer.code },
      update: {},
      create: buyer,
    });
  }

  console.log("✅ Compradores creados");

  // ─── Consumibles ──────────────────────────────────────────────────────────
  const consumables = [
    { type: ConsumableType.PALLET, name: "Pallet Europeo", currentStock: 100, minStock: 20 },
    { type: ConsumableType.SACA_VACIA, name: "Saca vacía 1000L", currentStock: 500, minStock: 100 },
    { type: ConsumableType.CAPUCHON, name: "Capuchón PE transparente", currentStock: 500, minStock: 100 },
  ];

  for (const cons of consumables) {
    const existing = await prisma.consumable.findFirst({
      where: { name: cons.name },
    });
    if (!existing) {
      await prisma.consumable.create({ data: cons });
    }
  }

  console.log("✅ Consumibles creados");

  console.log("\n✅ Seed completado. Admin: admin@luvi2000.es / admin123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
