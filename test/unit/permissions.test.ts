import { describe, it, expect } from "vitest";
import { UserRole } from "@prisma/client";
import { canAccess, getAccessibleModules } from "@/lib/permissions";

describe("canAccess", () => {
  it("OPERARIO no accede a configuración ni expediciones", () => {
    expect(canAccess(UserRole.OPERARIO, "configuracion")).toBe(false);
    expect(canAccess(UserRole.OPERARIO, "expediciones")).toBe(false);
  });
  it("OPERARIO sí accede a recepciones, producción, almacén, trazabilidad", () => {
    expect(canAccess(UserRole.OPERARIO, "recepciones")).toBe(true);
    expect(canAccess(UserRole.OPERARIO, "produccion")).toBe(true);
    expect(canAccess(UserRole.OPERARIO, "almacen")).toBe(true);
    expect(canAccess(UserRole.OPERARIO, "trazabilidad")).toBe(true);
  });
  it("ADMIN accede a todo", () => {
    expect(canAccess(UserRole.ADMIN, "configuracion")).toBe(true);
    expect(canAccess(UserRole.ADMIN, "usuarios")).toBe(true);
  });
  it("solo ADMIN accede a configuración", () => {
    expect(canAccess(UserRole.MANAGER, "configuracion")).toBe(false);
    expect(canAccess(UserRole.ADMINISTRACION, "configuracion")).toBe(false);
  });
});

describe("getAccessibleModules", () => {
  it("OPERARIO obtiene un subconjunto sin configuración", () => {
    const mods = getAccessibleModules(UserRole.OPERARIO);
    expect(mods).toContain("recepciones");
    expect(mods).not.toContain("configuracion");
  });
  it("ADMIN obtiene todos los módulos (12)", () => {
    expect(getAccessibleModules(UserRole.ADMIN).length).toBe(12);
  });
});
