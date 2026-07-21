"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  registerConsumableMovement,
  registerPalletMovement,
  registerPalletReturn,
} from "@/lib/services/consumable.service";
import type { CurrentUser } from "@/lib/rbac";

export type ActionState = { ok: boolean; error?: string; message?: string };

function requireSession(): Promise<CurrentUser> {
  return requireModule("consumibles");
}

// ─── Movimiento de consumible (entrada / salida) ───────────────────────────────

const movementSchema = z.object({
  consumableId: z.string().min(1, "Selecciona un consumible"),
  direction: z.enum(["entrada", "salida"]),
  quantity: z.coerce
    .number()
    .int()
    .positive("La cantidad debe ser mayor que 0"),
  reason: z.string().min(1, "Indica el motivo"),
  vehiclePlate: z.string().optional(),
  notes: z.string().optional(),
});

export async function registerConsumableMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = movementSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    const signedQuantity = d.direction === "salida" ? -d.quantity : d.quantity;
    const consumable = await registerConsumableMovement({
      consumableId: d.consumableId,
      quantity: signedQuantity,
      reason: d.reason,
      vehiclePlate: d.vehiclePlate || undefined,
      notes: d.notes || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "REGISTER_CONSUMABLE_MOVEMENT",
      entity: "ConsumableMovement",
      entityId: consumable.id,
      payload: {
        consumableId: d.consumableId,
        direction: d.direction,
        quantity: signedQuantity,
        reason: d.reason,
      },
    });
    revalidatePath("/consumibles");
    return {
      ok: true,
      message:
        d.direction === "entrada" ? "Entrada registrada" : "Salida registrada",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar",
    };
  }
}

// ─── Movimiento de palés retornables (préstamo / devolución) ───────────────────

const palletSchema = z
  .object({
    buyerId: z.string().min(1, "Selecciona un comprador"),
    direction: z.enum(["prestamo", "devolucion"]),
    quantity: z.coerce
      .number()
      .int()
      .positive("La cantidad debe ser mayor que 0"),
    condition: z.enum(["OK", "NOK"]).optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.direction === "prestamo" || d.condition != null, {
    message: "Indica el estado (OK/NOK) de los palés devueltos",
    path: ["condition"],
  });

export async function registerPalletMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = palletSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    const signedQuantity =
      d.direction === "devolucion" ? -d.quantity : d.quantity;
    await registerPalletMovement({
      buyerId: d.buyerId,
      quantity: signedQuantity,
      condition: d.direction === "devolucion" ? d.condition : undefined,
      notes: d.notes || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "REGISTER_PALLET_MOVEMENT",
      entity: "PalletMovement",
      entityId: d.buyerId,
      payload: {
        buyerId: d.buyerId,
        direction: d.direction,
        quantity: signedQuantity,
        condition: d.direction === "devolucion" ? d.condition : undefined,
      },
    });
    revalidatePath("/consumibles");
    return {
      ok: true,
      message:
        d.direction === "prestamo"
          ? "Préstamo registrado"
          : "Devolución registrada",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al registrar",
    };
  }
}

// ─── Devolución de palés (cliente, matrícula, OK / rotos) ───────────────────────

const returnSchema = z
  .object({
    buyerId: z.string().min(1, "Selecciona un comprador"),
    date: z.string().optional(),
    vehiclePlate: z.string().optional(),
    okCount: z.coerce.number().int().min(0).default(0),
    brokenCount: z.coerce.number().int().min(0).default(0),
    palletConsumableId: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.okCount + d.brokenCount > 0, {
    message: "Indica al menos un palé recibido (OK o roto)",
    path: ["okCount"],
  });

export async function registerPalletReturnAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireSession();
    const parsed = returnSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const d = parsed.data;
    const res = await registerPalletReturn({
      buyerId: d.buyerId,
      okCount: d.okCount,
      brokenCount: d.brokenCount,
      vehiclePlate: d.vehiclePlate || undefined,
      date: d.date ? new Date(d.date) : undefined,
      palletConsumableId: d.palletConsumableId || undefined,
      notes: d.notes || undefined,
    });
    await logAudit({
      userId: actor.id,
      action: "REGISTER_PALLET_RETURN",
      entity: "PalletMovement",
      entityId: d.buyerId,
      payload: {
        buyerId: d.buyerId,
        received: res.received,
        restocked: res.restocked,
        broken: res.broken,
      },
    });
    revalidatePath("/consumibles");
    const restockNote =
      res.restocked > 0 ? `, ${res.restocked} de vuelta a stock` : "";
    return {
      ok: true,
      message: `Devolución registrada: ${res.received} recibidos (${res.broken} rotos)${restockNote}`,
    };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Error al registrar la devolución",
    };
  }
}
