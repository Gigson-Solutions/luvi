"use server";

import { signOut } from "@/lib/auth";

/** Cierra la sesión y redirige a /login. */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
