import type { NextConfig } from "next";

// Cabeceras de seguridad aplicadas a todas las respuestas.
const securityHeaders = [
  // Fuerza HTTPS durante 2 años (incluye subdominios).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Evita que la app se embeba en iframes de terceros (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Impide el MIME-sniffing del navegador.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // No filtra la URL completa como referrer a orígenes externos.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Desactiva APIs sensibles del navegador que la app no usa.
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), payment=(), usb=()",
  },
  // CSP: 'unsafe-inline'/'unsafe-eval' requeridos por el runtime de Next;
  // frame-ancestors 'none' refuerza X-Frame-Options.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
