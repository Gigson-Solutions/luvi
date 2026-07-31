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

  const u = session.user as {
    role?: string;
    name?: string | null;
    email?: string | null;
  };

  return (
    <div className="md:flex min-h-screen">
      <Sidebar
        role={u.role ?? "OPERARIO"}
        userName={u.name ?? null}
        userEmail={u.email ?? null}
      />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="px-4 md:px-6 py-5 max-w-screen-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
