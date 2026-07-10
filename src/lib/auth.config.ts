import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isLoginPage = nextUrl.pathname === "/login";
      const isApiAuth = nextUrl.pathname.startsWith("/api/auth");

      if (isApiAuth) return true;
      if (!isLoggedIn && !isLoginPage) return false;
      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/dashboards", nextUrl));
      }
      return true;
    },
    // Expone id/role del token en la sesión del middleware (edge), para que
    // la protección de rutas por rol funcione (el token lo rellena auth.ts).
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id =
          (token.id as string | undefined) ?? session.user.id;
        (session.user as { role?: string }).role = token.role as
          string | undefined;
      }
      return session;
    },
  },
  providers: [],
};
