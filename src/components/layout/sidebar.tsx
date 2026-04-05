import Link from "next/link";
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
} from "lucide-react";
import { canAccess } from "@/lib/permissions";
import { UserRole } from "@prisma/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module: Parameters<typeof canAccess>[1];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboards", href: "/dashboards", icon: LayoutDashboard, module: "dashboards" },
  { label: "Recepciones", href: "/recepciones", icon: Truck, module: "recepciones" },
  { label: "Almacén", href: "/almacen", icon: Warehouse, module: "almacen" },
  { label: "Producción", href: "/produccion", icon: Factory, module: "produccion" },
  { label: "Trazabilidad", href: "/trazabilidad", icon: Route, module: "trazabilidad" },
  { label: "Expediciones", href: "/expediciones", icon: PackageCheck, module: "expediciones" },
  { label: "Aprovisionamiento", href: "/aprovisionamiento", icon: Ship, module: "aprovisionamiento" },
  { label: "Calidad", href: "/calidad", icon: FlaskConical, module: "calidad" },
  { label: "Consumibles", href: "/consumibles", icon: Package, module: "consumibles" },
  { label: "Incidencias", href: "/incidencias", icon: AlertTriangle, module: "incidencias" },
  { label: "Usuarios", href: "/usuarios", icon: Users, module: "usuarios" },
  { label: "Configuración", href: "/configuracion", icon: Settings, module: "configuracion" },
];

interface SidebarProps {
  role: string;
}

export function Sidebar({ role }: SidebarProps): React.JSX.Element {
  const userRole = role as UserRole;

  const visibleItems = NAV_ITEMS.filter((item) => canAccess(userRole, item.module));

  return (
    <aside className="w-56 shrink-0 min-h-screen bg-[var(--color-sidebar-bg)] flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-white/10">
        <div className="w-7 h-7 rounded-lg bg-[var(--color-primary)] flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-sm">L</span>
        </div>
        <span className="text-white font-semibold text-sm tracking-wide">Luvi</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--color-sidebar-text)] hover:bg-[var(--color-sidebar-hover)] hover:text-white transition-colors text-sm group"
            >
              <Icon className="w-4 h-4 shrink-0 opacity-70 group-hover:opacity-100" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-white/10">
        <p className="text-xs text-[var(--color-sidebar-text)] opacity-50">
          Luvi2000 · Gigson Solutions
        </p>
      </div>
    </aside>
  );
}
