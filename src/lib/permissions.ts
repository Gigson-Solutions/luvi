import { UserRole } from "@prisma/client";

type Module =
  | "recepciones"
  | "almacen"
  | "produccion"
  | "trazabilidad"
  | "expediciones"
  | "aprovisionamiento"
  | "calidad"
  | "consumibles"
  | "incidencias"
  | "dashboards"
  | "usuarios"
  | "configuracion";

const PERMISSIONS: Record<Module, UserRole[]> = {
  recepciones: [UserRole.OPERARIO, UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  almacen: [UserRole.OPERARIO, UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  produccion: [UserRole.OPERARIO, UserRole.MANAGER, UserRole.ADMIN],
  trazabilidad: [UserRole.OPERARIO, UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  expediciones: [UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  aprovisionamiento: [UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  calidad: [UserRole.MANAGER, UserRole.ADMIN],
  consumibles: [UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  incidencias: [UserRole.OPERARIO, UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  dashboards: [UserRole.ADMINISTRACION, UserRole.MANAGER, UserRole.ADMIN],
  usuarios: [UserRole.MANAGER, UserRole.ADMIN],
  configuracion: [UserRole.ADMIN],
};

export function canAccess(role: UserRole, module: Module): boolean {
  return PERMISSIONS[module].includes(role);
}

export function getAccessibleModules(role: UserRole): Module[] {
  return (Object.keys(PERMISSIONS) as Module[]).filter((mod) =>
    PERMISSIONS[mod].includes(role)
  );
}
