import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

const { auth } = NextAuth(authConfig);

// Rutas accesibles por rol
const ROLE_ROUTES: Record<UserRole, string[]> = {
  OPERARIO: [
    "/operario",
    "/recepciones",
    "/produccion",
    "/trazabilidad",
    "/almacen",
    "/incidencias",
  ],
  ADMINISTRACION: [
    "/recepciones",
    "/almacen",
    "/expediciones",
    "/consumibles",
    "/aprovisionamiento",
    "/trazabilidad",
    "/dashboards",
    "/incidencias",
  ],
  MANAGER: [
    "/recepciones",
    "/almacen",
    "/produccion",
    "/trazabilidad",
    "/expediciones",
    "/aprovisionamiento",
    "/calidad",
    "/consumibles",
    "/incidencias",
    "/dashboards",
    "/usuarios",
  ],
  ADMIN: [], // acceso a todo
};

// Página de inicio según rol (el operario tiene su vista móvil propia).
function homeFor(role?: UserRole): string {
  return role === UserRole.OPERARIO ? "/operario" : "/dashboards";
}

export default auth(
  (req: NextRequest & { auth: { user?: { role?: string } } | null }) => {
    const isLoggedIn = !!req.auth;
    const { pathname } = req.nextUrl;
    const isLoginPage = pathname === "/login";
    const isApiAuth = pathname.startsWith("/api/auth");
    const isApiRoute = pathname.startsWith("/api/");
    const role = req.auth?.user?.role as UserRole | undefined;

    if (isApiAuth || isApiRoute) return NextResponse.next();
    if (!isLoggedIn && !isLoginPage) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (isLoggedIn && isLoginPage) {
      return NextResponse.redirect(new URL(homeFor(role), req.url));
    }

    if (!isLoggedIn) return NextResponse.next();
    if (!role) return NextResponse.next();
    if (role === UserRole.ADMIN) return NextResponse.next();

    const allowedRoutes = ROLE_ROUTES[role] ?? [];
    const isAllowed = allowedRoutes.some((route) => pathname.startsWith(route));

    if (!isAllowed && pathname !== "/") {
      return NextResponse.redirect(new URL(homeFor(role), req.url));
    }

    return NextResponse.next();
  },
);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
