"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { UserRole } from "@prisma/client";
import { requireModule } from "@/lib/rbac";
import { logAudit } from "@/lib/services/audit.service";
import {
  createUser,
  updateUserRole,
  setUserActive,
  resetUserPassword,
} from "@/lib/services/user.service";

export type ActionState = { ok: boolean; error?: string; message?: string };

const roleValues = [
  UserRole.OPERARIO,
  UserRole.ADMINISTRACION,
  UserRole.MANAGER,
  UserRole.ADMIN,
] as const;

const createSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio"),
  email: z.string().email("Email no válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  role: z.enum(roleValues),
});

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireModule("usuarios");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const created = await createUser(parsed.data);
    await logAudit({
      userId: actor.id,
      action: "CREATE_USER",
      entity: "User",
      entityId: created.id,
      payload: { email: created.email, role: created.role },
    });
    revalidatePath("/usuarios");
    return { ok: true, message: "Usuario creado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al crear usuario",
    };
  }
}

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(roleValues),
});

export async function updateRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireModule("usuarios");
    const parsed = roleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    await updateUserRole(parsed.data.userId, parsed.data.role);
    await logAudit({
      userId: actor.id,
      action: "UPDATE_USER_ROLE",
      entity: "User",
      entityId: parsed.data.userId,
      payload: { role: parsed.data.role },
    });
    revalidatePath("/usuarios");
    return { ok: true, message: "Rol actualizado" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al cambiar el rol",
    };
  }
}

const toggleSchema = z.object({
  userId: z.string().min(1),
  active: z.enum(["true", "false"]),
});

export async function toggleActiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireModule("usuarios");
    const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    const active = parsed.data.active === "true";
    await setUserActive(parsed.data.userId, active, actor.id);
    await logAudit({
      userId: actor.id,
      action: active ? "ACTIVATE_USER" : "DEACTIVATE_USER",
      entity: "User",
      entityId: parsed.data.userId,
    });
    revalidatePath("/usuarios");
    return {
      ok: true,
      message: active ? "Usuario activado" : "Usuario desactivado",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al cambiar el estado",
    };
  }
}

const resetSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const actor = await requireModule("usuarios");
    const parsed = resetSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Datos inválidos",
      };
    }
    await resetUserPassword(parsed.data.userId, parsed.data.password);
    await logAudit({
      userId: actor.id,
      action: "RESET_USER_PASSWORD",
      entity: "User",
      entityId: parsed.data.userId,
    });
    revalidatePath("/usuarios");
    return { ok: true, message: "Contraseña restablecida" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Error al restablecer",
    };
  }
}
