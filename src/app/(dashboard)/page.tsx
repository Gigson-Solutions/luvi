import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UserRole } from "@prisma/client";

export default async function HomePage(): Promise<never> {
  const session = await auth();
  const role = (session?.user as { role?: string })?.role;
  redirect(role === UserRole.OPERARIO ? "/operario" : "/dashboards");
}
