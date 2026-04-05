import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar role={(session.user as { role?: string }).role ?? "OPERARIO"} />
      <main className="flex-1 overflow-auto">
        <div className="px-6 py-5 max-w-screen-2xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
