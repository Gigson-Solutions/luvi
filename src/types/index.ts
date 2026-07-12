import type { User, UserRole } from "@prisma/client";

// Usuario de sesión (subset seguro, sin password)
export type SessionUser = Pick<User, "id" | "name" | "email" | "role" | "image">;

// Extiende el tipo de sesión de NextAuth
declare module "next-auth" {
  interface Session {
    user: SessionUser;
  }
  interface User {
    role: UserRole;
  }
}

// Nota: la augmentación de "next-auth/jwt" da TS2664 bajo moduleResolution "bundler".
// El callback jwt() en auth.ts ya castea token.id/token.role, así que no es necesaria.
