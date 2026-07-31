import { UserRole } from "@prisma/client";
import { type Tone } from "@/components/ui/badge";

// Constantes de roles en un módulo plano (sin "use client") para que puedan
// importarse tanto desde Server Components (page.tsx) como desde el módulo
// cliente de diálogos. Importar valores desde un módulo "use client" en un
// Server Component los convierte en referencias de cliente y rompe (.map, etc.).

export const ROLES: UserRole[] = [
  UserRole.OPERARIO,
  UserRole.ADMINISTRACION,
  UserRole.MANAGER,
  UserRole.ADMIN,
];

export const ROLE_LABELS: Record<UserRole, string> = {
  OPERARIO: "Operario",
  ADMINISTRACION: "Administración",
  MANAGER: "Manager",
  ADMIN: "Administrador",
};

// Colores alineados con el prototipo Emergent: operario gris/slate,
// administración azul, manager púrpura, admin verde. (No hay "slate" en el
// Badge → se usa "gray" como neutro gris equivalente.)
export const ROLE_TONES: Record<UserRole, Tone> = {
  OPERARIO: "gray",
  ADMINISTRACION: "blue",
  MANAGER: "purple",
  ADMIN: "green",
};
