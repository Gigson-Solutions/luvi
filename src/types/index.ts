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

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
  }
}
