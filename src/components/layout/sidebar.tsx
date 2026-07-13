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
  PackageCheck,
  Ship,
  FlaskConical,
  Package,
  AlertTriangle,
  Users,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { canAccess } from "@/lib/permissions";
import { UserRole } from "@prisma/client";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module: Parameters<typeof canAccess>[1];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboards",
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
  {
    label: "Trazabilidad",
    href: "/trazabilidad",
    icon: Route,
    module: "trazabilidad",
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
  { label: "Calidad", href: "/calidad", icon: FlaskConical, module: "calidad" },
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
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shrink-0">
        <span className="text-white font-bold text-sm">L</span>
      </div>
      <span className="text-white font-semibold text-sm tracking-wide">
        Luvi
      </span>
    </div>
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
}

export function Sidebar({ role }: SidebarProps): React.JSX.Element {
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
        <div className="px-3 py-3 border-t border-white/10">
          <p className="text-xs text-[var(--color-sidebar-text)] opacity-50">
            Luvi2000 · Gigson Solutions
          </p>
        </div>
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
            <div className="px-3 py-3 border-t border-white/10">
              <p className="text-xs text-[var(--color-sidebar-text)] opacity-50">
                Luvi2000 · Gigson Solutions
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
