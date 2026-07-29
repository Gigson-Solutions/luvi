import Link from "next/link";
import {
  Building,
  Boxes,
  ShoppingCart,
  Truck,
  Warehouse as WarehouseIcon,
  Users,
  ClipboardCheck,
  Euro,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";
import {
  listMaterials,
  listSuppliers,
  listBuyers,
  listCarriers,
  listWarehouses,
} from "@/lib/services/config.service";
import { getQualityRanges } from "@/lib/services/quality.service";
import { getCostsConfig } from "@/lib/services/cost.service";
import { listUsers } from "@/lib/services/user.service";
import {
  MaterialsSection,
  SuppliersSection,
  BuyersSection,
  CarriersSection,
  WarehousesSection,
  UsersSection,
  QualitySection,
  CostsSection,
} from "./config-sections";

type TabKey =
  | "proveedores"
  | "materiales"
  | "compradores"
  | "transportistas"
  | "almacenes"
  | "usuarios"
  | "calidad"
  | "costes";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "proveedores", label: "Proveedores", icon: Building },
  { key: "materiales", label: "Materiales", icon: Boxes },
  { key: "compradores", label: "Compradores", icon: ShoppingCart },
  { key: "transportistas", label: "Transportistas", icon: Truck },
  { key: "almacenes", label: "Almacenes y Zonas", icon: WarehouseIcon },
  { key: "usuarios", label: "Usuarios", icon: Users },
  { key: "calidad", label: "Calidad", icon: ClipboardCheck },
  { key: "costes", label: "Costes", icon: Euro },
];

function isTabKey(v: string | undefined): v is TabKey {
  return TABS.some((t) => t.key === v);
}

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}): Promise<React.JSX.Element> {
  const { tab } = await searchParams;
  const activeTab: TabKey = isTabKey(tab) ? tab : "proveedores";

  const [
    materials,
    suppliers,
    buyers,
    carriers,
    warehouses,
    users,
    qualityRanges,
    costs,
    session,
  ] = await Promise.all([
    listMaterials(),
    listSuppliers(),
    listBuyers(),
    listCarriers(),
    listWarehouses(),
    listUsers(),
    getQualityRanges(),
    getCostsConfig(),
    auth(),
  ]);
  const currentUserId = session?.user?.id ?? "";

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Catálogos maestros: proveedores, materiales, transportistas, almacenes, usuarios, calidad y costes."
      />

      {/* Pestañas por ?tab= */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6 border-b border-[var(--color-border)]">
        {TABS.map((t) => {
          const active = t.key === activeTab;
          const Icon = t.icon;
          return (
            <Link
              key={t.key}
              href={`/configuracion?tab=${t.key}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                  : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "proveedores" && (
        <SuppliersSection suppliers={suppliers} />
      )}
      {activeTab === "materiales" && <MaterialsSection materials={materials} />}
      {activeTab === "compradores" && <BuyersSection buyers={buyers} />}
      {activeTab === "transportistas" && (
        <CarriersSection carriers={carriers} />
      )}
      {activeTab === "almacenes" && (
        <WarehousesSection warehouses={warehouses} />
      )}
      {activeTab === "usuarios" && (
        <UsersSection users={users} currentUserId={currentUserId} />
      )}
      {activeTab === "calidad" && <QualitySection ranges={qualityRanges} />}
      {activeTab === "costes" && <CostsSection costs={costs} />}
    </div>
  );
}
