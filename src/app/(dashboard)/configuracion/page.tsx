import Link from "next/link";
import {
  Building,
  Boxes,
  Tags,
  ShoppingCart,
  Truck,
  Warehouse as WarehouseIcon,
  Users,
  ClipboardCheck,
  Euro,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/lib/rbac";
import { canAccess } from "@/lib/permissions";
import {
  listMaterials,
  listSuppliers,
  listBuyers,
  listCarriers,
  listWarehouses,
} from "@/lib/services/config.service";
import {
  getQualityRanges,
  listQualityRangeSets,
} from "@/lib/services/quality.service";
import { getCostsConfig } from "@/lib/services/cost.service";
import { listUsers } from "@/lib/services/user.service";
import { listMaterialCategories } from "@/lib/services/material.service";
import { listConsumables } from "@/lib/services/consumable.service";
import {
  MaterialsSection,
  MaterialTypesSection,
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
  | "tipos-material"
  | "compradores"
  | "transportistas"
  | "almacenes"
  | "usuarios"
  | "calidad"
  | "costes";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "proveedores", label: "Proveedores", icon: Building },
  { key: "materiales", label: "Materiales", icon: Boxes },
  { key: "tipos-material", label: "Tipos de material", icon: Tags },
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
  const user = await getCurrentUser();
  // Sin acceso a la configuración completa (rol Calidad) solo se ve la pestaña
  // de calidad; el proxy ya deja fuera al resto de roles.
  const fullAccess = !!user && canAccess(user.role, "configuracion");
  const tabs = fullAccess ? TABS : TABS.filter((t) => t.key === "calidad");
  const activeTab: TabKey =
    isTabKey(tab) && tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  const [
    materials,
    materialCategories,
    suppliers,
    buyers,
    carriers,
    warehouses,
    users,
    qualityRanges,
    qualityRangeSets,
    consumables,
    costs,
  ] = await Promise.all([
    listMaterials(),
    listMaterialCategories(),
    listSuppliers(),
    listBuyers(),
    listCarriers(),
    listWarehouses(),
    listUsers(),
    getQualityRanges(),
    listQualityRangeSets(),
    listConsumables(),
    getCostsConfig(),
  ]);
  const currentUserId = user?.id ?? "";
  const consumableOptions = consumables.map((c) => ({
    id: c.id,
    name: c.name,
    unit: c.unit,
    unitCost: c.unitCost,
  }));

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Catálogos maestros: proveedores, materiales, transportistas, almacenes, usuarios, calidad y costes."
      />

      {/* Pestañas por ?tab= */}
      <div className="flex flex-wrap items-center gap-1.5 mb-6 border-b border-[var(--color-border)]">
        {tabs.map((t) => {
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
      {activeTab === "materiales" && (
        <MaterialsSection
          materials={materials}
          categories={materialCategories}
          consumables={consumableOptions}
          rangeSets={qualityRangeSets}
        />
      )}
      {activeTab === "tipos-material" && (
        <MaterialTypesSection
          categories={materialCategories}
          rangeSets={qualityRangeSets}
        />
      )}
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
      {activeTab === "calidad" && (
        <QualitySection
          ranges={qualityRanges}
          rangeSets={qualityRangeSets}
          materials={materials}
          categories={materialCategories}
        />
      )}
      {activeTab === "costes" && <CostsSection costs={costs} />}
    </div>
  );
}
