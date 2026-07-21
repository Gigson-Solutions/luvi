import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import { authConfig } from "./auth.config";
import { logAudit } from "./services/audit.service";
import { compare } from "bcryptjs";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  // Hashes bcrypt empiezan por $2 ($2a/$2b/$2y). Se verifican con bcrypt.compare.
  if (hash.startsWith("$2")) {
    return compare(password, hash);
  }
  // Compatibilidad hacia atrás: contraseñas antiguas hasheadas con SHA-256 hex.
  const { createHash } = await import("crypto");
  return createHash("sha256").update(password).digest("hex") === hash;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Cast: desfase de patch entre @auth/core que arrastran next-auth y prisma-adapter.
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email, active: true },
        });
        if (!user) return null;

        const valid = await verifyPassword(password, user.password);
        if (!valid) return null;

        await logAudit({
          userId: user.id,
          action: "LOGIN",
          entity: "User",
          entityId: user.id,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      (session.user as { role?: string }).role = token.role as string;
      return session;
    },
  },
});
