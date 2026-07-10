import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "";
  // Prisma 7 exige driver adapter explícito.
  // Producción (Neon serverless) → adapter Neon por WebSocket.
  // Local (Postgres normal, p.ej. Docker) → adapter node-postgres.
  const isNeon = /neon\.tech/i.test(url) || process.env.USE_NEON === "true";
  const adapter = isNeon
    ? new PrismaNeon({ connectionString: url })
    : new PrismaPg({ connectionString: url });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
