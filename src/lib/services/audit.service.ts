import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Registro de auditoría — deja traza de las acciones sensibles del sistema
 * (login, altas/bajas de usuarios, confirmación de expediciones, etc.).
 *
 * Regla de oro: el audit log NUNCA debe romper la operativa. Cualquier fallo
 * al escribir se traga silenciosamente; la acción de negocio sigue su curso.
 */

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Prisma.InputJsonValue;
}

/** Intenta extraer la IP del cliente de las cabeceras de la request actual. */
async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]?.trim() ?? null;
    return h.get("x-real-ip");
  } catch {
    // Fuera de un contexto de request (p.ej. seed o job): sin IP.
    return null;
  }
}

/** Escribe una entrada de auditoría. Silencioso ante errores. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const ip = await clientIp();
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        payload: input.payload,
        ip,
      },
    });
  } catch {
    // Nunca propagar: la auditoría no puede tumbar la operativa.
  }
}
