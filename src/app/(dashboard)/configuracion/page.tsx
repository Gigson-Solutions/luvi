import { PageHeader } from "@/components/layout/page-header";
import {
  listMaterials,
  listSuppliers,
  listBuyers,
  listCarriers,
  listWarehouses,
} from "@/lib/services/config.service";
import { ConfigSections } from "./config-sections";

export default async function ConfiguracionPage(): Promise<React.JSX.Element> {
  const [materials, suppliers, buyers, carriers, warehouses] =
    await Promise.all([
      listMaterials(),
      listSuppliers(),
      listBuyers(),
      listCarriers(),
      listWarehouses(),
    ]);

  return (
    <div>
      <PageHeader
        title="Configuración"
        description="Catálogos maestros: materiales, proveedores, compradores, transportistas, almacenes y zonas."
      />
      <ConfigSections
        materials={materials}
        suppliers={suppliers}
        buyers={buyers}
        carriers={carriers}
        warehouses={warehouses}
      />
    </div>
  );
}
