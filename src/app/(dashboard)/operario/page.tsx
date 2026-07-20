import Link from "next/link";
import {
  Truck,
  Factory,
  Warehouse,
  Route,
  AlertTriangle,
  QrCode,
} from "lucide-react";
import { auth } from "@/lib/auth";

interface Action {
  label: string;
  href: string;
  icon: React.ElementType;
  color: string;
}

// Accesos rápidos del operario (móvil-first, objetivos táctiles grandes).
const ACTIONS: Action[] = [
  { label: "Recepción", href: "/recepciones", icon: Truck, color: "#3b82f6" },
  { label: "Producción", href: "/produccion", icon: Factory, color: "#8b5cf6" },
  { label: "Almacén", href: "/almacen", icon: Warehouse, color: "#0ea5e9" },
  {
    label: "Trazabilidad",
    href: "/trazabilidad",
    icon: Route,
    color: "#15803d",
  },
  {
    label: "Escanear QR",
    href: "/trazabilidad",
    icon: QrCode,
    color: "#0f766e",
  },
  {
    label: "Incidencia",
    href: "/incidencias",
    icon: AlertTriangle,
    color: "#ef4444",
  },
];

export default async function OperarioPage(): Promise<React.JSX.Element> {
  const session = await auth();
  const name = session?.user?.name ?? "Operario";

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-6">
        <p className="text-sm text-[var(--color-muted)]">Hola,</p>
        <h1 className="text-2xl font-semibold text-[var(--color-foreground)]">
          {name}
        </h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">
          ¿Qué vas a hacer?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.label}
              href={a.href}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 min-h-36 active:scale-95 transition-transform shadow-sm"
            >
              <span
                className="flex items-center justify-center w-14 h-14 rounded-2xl"
                style={{ backgroundColor: `${a.color}1a`, color: a.color }}
              >
                <Icon className="w-7 h-7" />
              </span>
              <span className="text-base font-medium text-[var(--color-foreground)] text-center">
                {a.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
