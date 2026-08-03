"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Warehouse,
  Factory,
  Route,
  Boxes,
  PackageCheck,
  Ship,
  FlaskConical,
  Package,
  AlertTriangle,
  QrCode,
  Users,
  Settings,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { canAccess } from "@/lib/permissions";
import { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/app/(dashboard)/logout";

/** Pie del sidebar: usuario actual + cerrar sesión. */
function SidebarFooter({
  userName,
  userEmail,
}: {
  userName: string | null;
  userEmail: string | null;
}): React.JSX.Element {
  return (
    <div className="px-3 py-3 border-t border-white/10 space-y-2">
      {(userName || userEmail) && (
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white uppercase">
            {(userName || userEmail || "?").charAt(0)}
          </div>
          <div className="min-w-0">
            {userName && (
              <p className="truncate text-sm font-medium text-white">
                {userName}
              </p>
            )}
            {userEmail && (
              <p className="truncate text-xs text-[var(--color-sidebar-text)] opacity-60">
                {userEmail}
              </p>
            )}
          </div>
        </div>
      )}
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
      </form>
      <p className="text-xs text-[var(--color-sidebar-text)] opacity-40 px-1">
        Luvi2000 · Gigson Solutions
      </p>
    </div>
  );
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module: Parameters<typeof canAccess>[1];
}

// Orden del menú alineado con el prototipo de referencia (Emergent).
const NAV_ITEMS: NavItem[] = [
  {
    label: "Panel Principal",
    href: "/dashboards",
    icon: LayoutDashboard,
    module: "dashboards",
  },
  {
    label: "Recepciones",
    href: "/recepciones",
    icon: Truck,
    module: "recepciones",
  },
  { label: "Almacén", href: "/almacen", icon: Warehouse, module: "almacen" },
  {
    label: "Producción",
    href: "/produccion",
    icon: Factory,
    module: "produccion",
  },
  { label: "Calidad", href: "/calidad", icon: FlaskConical, module: "calidad" },
  {
    label: "Trazabilidad",
    href: "/trazabilidad",
    icon: Route,
    module: "trazabilidad",
  },
  {
    label: "Inventario",
    href: "/inventario",
    icon: Boxes,
    module: "inventario",
  },
  {
    label: "Consumibles",
    href: "/consumibles",
    icon: Package,
    module: "consumibles",
  },
  {
    label: "Incidencias",
    href: "/incidencias",
    icon: AlertTriangle,
    module: "incidencias",
  },
  {
    label: "Expediciones",
    href: "/expediciones",
    icon: PackageCheck,
    module: "expediciones",
  },
  {
    label: "Aprovisionamiento",
    href: "/aprovisionamiento",
    icon: Ship,
    module: "aprovisionamiento",
  },
  { label: "Gestión QR", href: "/qr", icon: QrCode, module: "qr" },
  { label: "Usuarios", href: "/usuarios", icon: Users, module: "usuarios" },
  {
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    module: "configuracion",
  },
];

function Logo(): React.JSX.Element {
  return (
    // Logo real del cliente (versión clara para el sidebar oscuro).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/luvi2000-logo-light.png"
      alt="Luvi2000"
      className="h-6 w-auto select-none"
    />
  );
}

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}): React.JSX.Element {
  return (
    <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            // Sin prefetch: en la caja autohospedada (2 vCPU) prefetchear los
            // ~14 destinos a la vez satura el server y provoca 503 puntuales
            // en peticiones concurrentes (p.ej. el cambio de rol). Se navega
            // igual, solo se pierde la precarga en segundo plano.
            prefetch={false}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors group",
              active
                ? "bg-[var(--color-sidebar-active)] text-white"
                : "text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white",
            )}
          >
            <Icon className="w-4 h-4 shrink-0 opacity-80 group-hover:opacity-100" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

interface SidebarProps {
  role: string;
  userName?: string | null;
  userEmail?: string | null;
}

export function Sidebar({
  role,
  userName = null,
  userEmail = null,
}: SidebarProps): React.JSX.Element {
  const userRole = role as UserRole;
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) =>
    canAccess(userRole, item.module),
  );

  return (
    <>
      {/* Barra superior — solo móvil */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-[var(--color-sidebar-bg)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="text-white p-1 -ml-1 rounded-lg hover:bg-[var(--color-sidebar-hover)]"
        >
          <Menu className="w-6 h-6" />
        </button>
        <Logo />
      </header>

      {/* Sidebar fijo — escritorio */}
      <aside className="hidden md:flex w-56 shrink-0 min-h-screen bg-[var(--color-sidebar-bg)] flex-col">
        <div className="flex items-center h-14 px-4 border-b border-white/10">
          <Logo />
        </div>
        <NavLinks items={visibleItems} pathname={pathname} />
        <SidebarFooter userName={userName} userEmail={userEmail} />
      </aside>

      {/* Drawer — móvil */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="relative w-64 max-w-[80%] min-h-screen bg-[var(--color-sidebar-bg)] flex flex-col">
            <div className="flex items-center justify-between h-14 px-4 border-b border-white/10">
              <Logo />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar menú"
                className="text-white p-1 rounded-lg hover:bg-[var(--color-sidebar-hover)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <NavLinks
              items={visibleItems}
              pathname={pathname}
              onNavigate={() => setOpen(false)}
            />
            <SidebarFooter userName={userName} userEmail={userEmail} />
          </div>
        </div>
      )}
    </>
  );
}
