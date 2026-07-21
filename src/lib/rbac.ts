import { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { canAccess, type Module } from "@/lib/permissions";

/**
 * Guard de autorización centralizado (RBAC) para Server Actions y rutas.
 *
 * Toda mutación debe empezar por uno de estos helpers: obtienen el usuario de
 * la sesión y verifican rol/módulo antes de tocar la base de datos. Lanzan si
 * el usuario no está autenticado o no tiene permiso; el `try/catch` de la
 * action lo convierte en `{ ok: false, error }`.
 */

export interface CurrentUser {
  id: string;
  role: UserRole;
  name: string | null;
  email: string | null;
}

/** Devuelve el usuario de la sesión actual, o null si no hay sesión válida. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const user = session?.user as
    | {
        id?: string;
        role?: UserRole;
        name?: string | null;
        email?: string | null;
      }
    | undefined;
  if (!user?.id || !user.role) return null;
  return {
    id: user.id,
    role: user.role,
    name: user.name ?? null,
    email: user.email ?? null,
  };
}

/** Exige sesión autenticada. Lanza "No autenticado" si no la hay. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  return user;
}

/** Exige que el usuario tenga uno de los roles indicados. */
export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("No autorizado");
  return user;
}

/** Exige que el rol del usuario tenga acceso al módulo (según permissions.ts). */
export async function requireModule(module: Module): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canAccess(user.role, module)) throw new Error("No autorizado");
  return user;
}
