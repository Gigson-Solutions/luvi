import { execSync } from "node:child_process";

const E2E_DB = "postgresql://luvi:luvi@localhost:5433/luvi_e2e?schema=public";

// Todas las tablas del schema (nombres @@map).
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

// Deja la BD e2e en estado conocido antes de la suite (truncate + seed real).
// Usamos TRUNCATE (no `prisma migrate reset`, que está bloqueado para agentes).
export default async function globalSetup(): Promise<void> {
  const truncate = `TRUNCATE TABLE ${TABLES.map((t) => `\\"${t}\\"`).join(", ")} RESTART IDENTITY CASCADE;`;
  execSync(`docker exec luvi-pg psql -U luvi -d luvi_e2e -c "${truncate}"`, {
    stdio: "inherit",
  });
  execSync("pnpm exec tsx prisma/seed.ts", {
    env: { ...process.env, DATABASE_URL: E2E_DB },
    stdio: "inherit",
  });
}
