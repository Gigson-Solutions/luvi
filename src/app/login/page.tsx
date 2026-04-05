import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}): React.JSX.Element {
  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/dashboards",
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(`/login?error=${error.type}`);
      }
      throw error;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-sidebar-bg)]">
      <div className="w-full max-w-sm">
        {/* Logo / marca */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--color-primary)] mb-4">
            <span className="text-white font-bold text-2xl font-[var(--font-public-sans)]">L</span>
          </div>
          <h1 className="text-white text-2xl font-semibold">Luvi</h1>
          <p className="text-[var(--color-sidebar-text)] text-sm mt-1">
            Sistema de gestión logística
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--color-surface)] rounded-2xl p-8 shadow-xl">
          {searchParams.error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Credenciales incorrectas. Inténtalo de nuevo.
            </div>
          )}

          <form action={login} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition"
                placeholder="tu@luvi2000.es"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white font-medium text-sm rounded-lg transition focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
            >
              Entrar
            </button>
          </form>
        </div>

        <p className="text-center text-[var(--color-sidebar-text)] text-xs mt-6">
          Luvi2000 © {new Date().getFullYear()} — Gigson Solutions
        </p>
      </div>
    </div>
  );
}
