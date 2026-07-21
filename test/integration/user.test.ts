import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { UserRole } from "@prisma/client";
import { compare } from "bcryptjs";
import { prisma, resetDb, seedBaseline, type Baseline } from "../db";
import {
  createUser,
  listUsers,
  updateUserRole,
  setUserActive,
  resetUserPassword,
} from "@/lib/services/user.service";

let base: Baseline;

beforeEach(async () => {
  await resetDb();
  base = await seedBaseline();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Usuarios — creación y hashing de contraseña", () => {
  it("crea un usuario guardando la contraseña hasheada con bcrypt", async () => {
    const created = await createUser({
      name: "Nuevo Operario",
      email: "nuevo@test.local",
      password: "secreto123",
      role: UserRole.OPERARIO,
    });

    expect(created.id).toBeTruthy();
    expect(created.email).toBe("nuevo@test.local");
    expect(created.role).toBe(UserRole.OPERARIO);
    expect(created.active).toBe(true);

    // La contraseña no viene en el select público…
    expect(
      (created as unknown as Record<string, unknown>).password,
    ).toBeUndefined();

    // …pero en BD está hasheada con bcrypt (lo que verifica auth.ts).
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: { password: true },
    });
    // Hash bcrypt: prefijo $2 y verificable con compare.
    expect(row.password).toMatch(/^\$2[aby]\$/);
    expect(await compare("secreto123", row.password)).toBe(true);
    // No es texto plano.
    expect(row.password).not.toBe("secreto123");
  });

  it("rechaza email duplicado", async () => {
    await createUser({
      name: "Primero",
      email: "dup@test.local",
      password: "clave123",
      role: UserRole.OPERARIO,
    });

    await expect(
      createUser({
        name: "Segundo",
        email: "dup@test.local",
        password: "otra123",
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow();

    // Sigue existiendo un único usuario con ese email.
    const rows = await prisma.user.findMany({
      where: { email: "dup@test.local" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Primero");
  });
});

describe("Usuarios — cambio de rol", () => {
  it("cambia el rol de un usuario existente", async () => {
    const updated = await updateUserRole(base.operarioId, UserRole.MANAGER);
    expect(updated.role).toBe(UserRole.MANAGER);

    const row = await prisma.user.findUniqueOrThrow({
      where: { id: base.operarioId },
    });
    expect(row.role).toBe(UserRole.MANAGER);
  });
});

describe("Usuarios — activar / desactivar", () => {
  it("desactiva y reactiva a otro usuario", async () => {
    const deactivated = await setUserActive(
      base.operarioId,
      false,
      base.adminId,
    );
    expect(deactivated.active).toBe(false);

    const reactivated = await setUserActive(
      base.operarioId,
      true,
      base.adminId,
    );
    expect(reactivated.active).toBe(true);
  });

  it("un usuario NO puede desactivarse a sí mismo", async () => {
    await expect(
      setUserActive(base.adminId, false, base.adminId),
    ).rejects.toThrow(/a ti mismo/i);

    // El admin sigue activo.
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: base.adminId },
    });
    expect(row.active).toBe(true);
  });

  it("un usuario SÍ puede reactivarse a sí mismo (la regla solo bloquea desactivar)", async () => {
    // Primero lo desactiva otro actor.
    await setUserActive(base.adminId, false, base.operarioId);
    // Reactivarse a sí mismo debe permitirse (active === true).
    const reactivated = await setUserActive(base.adminId, true, base.adminId);
    expect(reactivated.active).toBe(true);
  });
});

describe("Usuarios — reseteo de contraseña", () => {
  it("resetea la contraseña guardándola con bcrypt", async () => {
    await resetUserPassword(base.operarioId, "nuevaClave456");
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: base.operarioId },
      select: { password: true },
    });
    expect(row.password).toMatch(/^\$2[aby]\$/);
    expect(await compare("nuevaClave456", row.password)).toBe(true);
    expect(await compare("op123", row.password)).toBe(false);
  });
});

describe("Usuarios — listado", () => {
  it("lista todos los usuarios (baseline: admin + operario)", async () => {
    const users = await listUsers();
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.email).sort()).toEqual(
      ["admin@test.local", "op@test.local"].sort(),
    );
    // El select público no expone la contraseña.
    expect(users.every((u) => !("password" in u))).toBe(true);
  });

  it("ordena activos primero y luego por nombre", async () => {
    // "Zzz Activo" > por nombre debería ir tras "Admin Test" y "Operario Test".
    await createUser({
      name: "Zzz Activo",
      email: "zzz@test.local",
      password: "clave123",
      role: UserRole.OPERARIO,
    });
    const inactivo = await createUser({
      name: "Aaa Inactivo",
      email: "aaa@test.local",
      password: "clave123",
      role: UserRole.OPERARIO,
    });
    await setUserActive(inactivo.id, false, base.adminId);

    const users = await listUsers();
    // Todos los activos preceden a cualquier inactivo.
    const firstInactiveIdx = users.findIndex((u) => !u.active);
    expect(firstInactiveIdx).toBeGreaterThan(-1);
    expect(users.slice(0, firstInactiveIdx).every((u) => u.active)).toBe(true);
    expect(users.slice(firstInactiveIdx).every((u) => !u.active)).toBe(true);
    // El inactivo (único) es el último.
    expect(users[users.length - 1].email).toBe("aaa@test.local");
    // Dentro de los activos, orden alfabético por nombre.
    const activos = users.filter((u) => u.active).map((u) => u.name);
    expect(activos).toEqual([...activos].sort((a, b) => a.localeCompare(b)));
  });
});
