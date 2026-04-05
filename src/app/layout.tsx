import type { Metadata } from "next";
import { Manrope, Public_Sans } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Luvi — Gestión Logística",
  description: "Sistema de gestión logística para Luvi2000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.JSX.Element {
  return (
    <html
      lang="es"
      className={`${manrope.variable} ${publicSans.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--color-background)] text-[var(--color-foreground)]">
        <NextTopLoader color="#15803d" height={3} showSpinner={false} />
        {children}
      </body>
    </html>
  );
}
