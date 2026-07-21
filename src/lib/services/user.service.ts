import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

/**
 * Servicio de Usuarios — gestión de usuarios y roles del sistema.
 *
 * Nota de seguridad: las contraseñas se hashean con bcrypt (coste 12). La
 * verificación en `src/lib/auth.ts` usa `bcrypt.compare`, con fallback a los
 * hashes SHA-256 antiguos para no invalidar sesiones existentes.
 */

const BCRYPT_ROUNDS = 12;

export interface UserListItem {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  image: string | null;
  createdAt: Date;
}

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  image: true,
  createdAt: true,
} as const;

/** Hashea una contraseña con bcrypt (coste 12), como espera `verifyPassword`. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

/** Lista todos los usuarios ordenados por nombre. */
export function listUsers(): Promise<UserListItem[]> {
  return prisma.user.findMany({
    select: USER_SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Crea un usuario con la contraseña hasheada. Lanza si el email ya existe. */
export async function createUser(
  input: CreateUserInput,
): Promise<UserListItem> {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Ya existe un usuario con ese email.");
  }

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: await hashPassword(input.password),
      role: input.role,
    },
    select: USER_SELECT,
  });
}

/** Cambia el rol de un usuario. */
export function updateUserRole(
  userId: string,
  role: UserRole,
): Promise<UserListItem> {
  return prisma.user.update({
    where: { id: userId },
    data: { role },
    select: USER_SELECT,
  });
}

/**
 * Activa/desactiva un usuario. Un usuario no puede desactivarse a sí mismo.
 * @param currentUserId id del usuario de la sesión actual.
 */
export async function setUserActive(
  userId: string,
  active: boolean,
  currentUserId: string,
): Promise<UserListItem> {
  if (!active && userId === currentUserId) {
    throw new Error("No puedes desactivarte a ti mismo.");
  }
  return prisma.user.update({
    where: { id: userId },
    data: { active },
    select: USER_SELECT,
  });
}

/** Resetea la contraseña de un usuario (hasheada con bcrypt). */
export async function resetUserPassword(
  userId: string,
  password: string,
): Promise<UserListItem> {
  return prisma.user.update({
    where: { id: userId },
    data: { password: await hashPassword(password) },
    select: USER_SELECT,
  });
}
