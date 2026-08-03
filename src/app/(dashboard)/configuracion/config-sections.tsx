"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  ExternalLink,
  Tags,
  Warehouse as WarehouseIcon,
  Users as UsersIcon,
} from "lucide-react";
import { MaterialType, UserRole } from "@prisma/client";
import type {
  Supplier,
  Buyer,
  Carrier,
  MaterialCategory,
} from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge, type Tone } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type {
  WarehouseWithZones,
  MaterialWithCategory,
} from "@/lib/services/config.service";
import type { UserListItem } from "@/lib/services/user.service";
import type { CostsConfig } from "@/lib/services/cost.service";
import {
  SAMPLE_MEASURE_KEYS,
  SAMPLE_MEASURE_LABELS,
  SAMPLE_MEASURE_UNITS,
  SAMPLE_MEASURE_COLORS,
} from "@/app/(dashboard)/calidad/quality-thresholds";
import type { QualityRanges } from "@/app/(dashboard)/calidad/quality-thresholds";
import {
  saveMaterialAction,
  saveMaterialCategoryAction,
  seedMaterialCategoriesAction,
  saveSupplierAction,
  saveBuyerAction,
  saveCarrierAction,
  saveWarehouseAction,
  saveZoneAction,
  deleteZoneAction,
  toggleActiveAction,
  saveQualityRangesAction,
  saveCostsAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  PELLET_PE: "Pellet PE",
  PELLET_PP: "Pellet PP",
  PELLET_PET: "Pellet PET",
  FILM_PE: "Film PE",
  FILM_PP: "Film PP",
  RIGIDO_MIXTO: "Rígido mixto",
  OTRO: "Otro",
};

// ─── Piezas reutilizables ───────────────────────────────────────────────────────

function SectionHeader({
  title,
  action,
}: {
  title: string;
  action: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
        {title}
      </h2>
      {action}
    </div>
  );
}

function ActiveBadge({ active }: { active: boolean }): React.JSX.Element {
  return (
    <Badge tone={active ? "green" : "gray"}>
      {active ? "Activo" : "Inactivo"}
    </Badge>
  );
}

/** Botón que activa/desactiva una entidad vía Server Action. */
function ToggleActiveButton({
  entity,
  id,
  active,
}: {
  entity:
    | "material"
    | "materialCategory"
    | "supplier"
    | "buyer"
    | "carrier"
    | "warehouse";
  id: string;
  active: boolean;
}): React.JSX.Element {
  const [, action] = useActionState(toggleActiveAction, INITIAL);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant={active ? "outline" : "secondary"}
        title={active ? "Desactivar" : "Activar"}
      >
        <Power className="w-3.5 h-3.5" />
        {active ? "Desactivar" : "Activar"}
      </Button>
    </form>
  );
}

/** Diálogo genérico con trigger. Se cierra al completar la acción con éxito. */
function EntityDialog({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: (state: ActionState) => React.ReactNode;
  submitLabel: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <form action={formAction} className="space-y-4">
          {children(state)}
          {state.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Materiales ────────────────────────────────────────────────────────────────

function MaterialFields({
  material,
  categories,
}: {
  material?: MaterialWithCategory;
  categories: MaterialCategory[];
}): React.JSX.Element {
  const activeCategories = categories.filter(
    (c) => c.active || c.id === material?.categoryId,
  );
  return (
    <>
      {material && <input type="hidden" name="id" value={material.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="mat-name">Nombre</Label>
          <Input
            id="mat-name"
            name="name"
            required
            defaultValue={material?.name}
          />
        </div>
        <div>
          <Label htmlFor="mat-code">Código</Label>
          <Input
            id="mat-code"
            name="code"
            required
            defaultValue={material?.code}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="mat-type">Tipo (físico)</Label>
          <Select
            id="mat-type"
            name="type"
            required
            defaultValue={material?.type ?? ""}
          >
            <option value="" disabled>
              Selecciona…
            </option>
            {Object.values(MaterialType).map((t) => (
              <option key={t} value={t}>
                {MATERIAL_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="mat-category">Categoría</Label>
          <Select
            id="mat-category"
            name="categoryId"
            defaultValue={material?.categoryId ?? ""}
          >
            <option value="">Sin categoría</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="mat-description">Descripción</Label>
        <Textarea
          id="mat-description"
          name="description"
          defaultValue={material?.description ?? ""}
        />
      </div>
    </>
  );
}

export function MaterialsSection({
  materials,
  categories,
}: {
  materials: MaterialWithCategory[];
  categories: MaterialCategory[];
}): React.JSX.Element {
  // Filtro por categoría (client-side). "" = todas, "none" = sin categoría.
  const [filter, setFilter] = useState<string>("");
  const filtered = useMemo(() => {
    if (filter === "") return materials;
    if (filter === "none") return materials.filter((m) => !m.categoryId);
    return materials.filter((m) => m.categoryId === filter);
  }, [materials, filter]);

  return (
    <section>
      <SectionHeader
        title={`Materiales (${filtered.length})`}
        action={
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus className="w-4 h-4" /> Nuevo material
              </Button>
            }
            title="Nuevo material"
            action={saveMaterialAction}
            submitLabel="Crear"
          >
            {() => <MaterialFields categories={categories} />}
          </EntityDialog>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        <Label
          htmlFor="mat-filter"
          className="text-xs text-[var(--color-muted)]"
        >
          Filtrar por categoría
        </Label>
        <Select
          id="mat-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-auto min-w-48"
        >
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">Sin categoría</option>
        </Select>
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          title="No hay materiales"
          description="Crea el primer material del catálogo o ajusta el filtro."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código</TH>
              <TH>Tipo</TH>
              <TH>Categoría</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.code}</TD>
                <TD>{MATERIAL_TYPE_LABELS[m.type]}</TD>
                <TD>
                  {m.category ? (
                    <Badge tone="blue">{m.category.name}</Badge>
                  ) : (
                    <span className="text-[var(--color-muted)]">—</span>
                  )}
                </TD>
                <TD>
                  <ActiveBadge active={m.active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                      }
                      title={`Editar · ${m.name}`}
                      action={saveMaterialAction}
                      submitLabel="Guardar"
                    >
                      {() => (
                        <MaterialFields material={m} categories={categories} />
                      )}
                    </EntityDialog>
                    <ToggleActiveButton
                      entity="material"
                      id={m.id}
                      active={m.active}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ─── Tipos de material (MaterialCategory) ────────────────────────────────────────

function MaterialCategoryFields(): React.JSX.Element {
  return (
    <div>
      <Label htmlFor="cat-name">Nombre</Label>
      <Input id="cat-name" name="name" required />
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Usa los nombres estándar (Materia Prima, Producto Terminado,
        Subproducto, Rechazo) para que el tipo se clasifique solo en el flujo.
      </p>
    </div>
  );
}

/** Botón para cargar los tipos de material por defecto (catálogo vacío). */
function SeedCategoriesButton(): React.JSX.Element {
  const [state, action] = useActionState(seedMaterialCategoriesAction, INITIAL);
  return (
    <form action={action} className="inline">
      <Button type="submit" size="sm" variant="secondary">
        <Plus className="w-4 h-4" /> Cargar por defecto
      </Button>
      {state.error && (
        <span className="ml-2 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

export function MaterialTypesSection({
  categories,
}: {
  categories: MaterialCategory[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Tipos de material (${categories.length})`}
        action={
          <div className="flex items-center gap-2">
            {categories.length === 0 && <SeedCategoriesButton />}
            <EntityDialog
              trigger={
                <Button size="sm">
                  <Plus className="w-4 h-4" /> Nuevo tipo
                </Button>
              }
              title="Nuevo tipo de material"
              action={saveMaterialCategoryAction}
              submitLabel="Crear"
            >
              {() => <MaterialCategoryFields />}
            </EntityDialog>
          </div>
        }
      />
      {categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No hay tipos de material"
          description="Crea el primer tipo o carga los tipos por defecto."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {categories.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD>
                  <ActiveBadge active={c.active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <ToggleActiveButton
                      entity="materialCategory"
                      id={c.id}
                      active={c.active}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ─── Proveedores ───────────────────────────────────────────────────────────────

function SupplierFields({
  supplier,
}: {
  supplier?: Supplier;
}): React.JSX.Element {
  return (
    <>
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="sup-name">Nombre</Label>
          <Input
            id="sup-name"
            name="name"
            required
            defaultValue={supplier?.name}
          />
        </div>
        <div>
          <Label htmlFor="sup-code">Código</Label>
          <Input
            id="sup-code"
            name="code"
            required
            defaultValue={supplier?.code}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="sup-country">País</Label>
        <Input
          id="sup-country"
          name="country"
          required
          defaultValue={supplier?.country ?? "ES"}
        />
      </div>
      <div>
        <Label htmlFor="sup-notes">Notas</Label>
        <Textarea
          id="sup-notes"
          name="notes"
          defaultValue={supplier?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function SuppliersSection({
  suppliers,
}: {
  suppliers: Supplier[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Proveedores (${suppliers.length})`}
        action={
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus className="w-4 h-4" /> Nuevo proveedor
              </Button>
            }
            title="Nuevo proveedor"
            action={saveSupplierAction}
            submitLabel="Crear"
          >
            {() => <SupplierFields />}
          </EntityDialog>
        }
      />
      {suppliers.length === 0 ? (
        <EmptyState
          title="No hay proveedores"
          description="Crea el primer proveedor."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código</TH>
              <TH>País</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {suppliers.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD>{s.code}</TD>
                <TD>{s.country}</TD>
                <TD>
                  <ActiveBadge active={s.active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                      }
                      title={`Editar · ${s.name}`}
                      action={saveSupplierAction}
                      submitLabel="Guardar"
                    >
                      {() => <SupplierFields supplier={s} />}
                    </EntityDialog>
                    <ToggleActiveButton
                      entity="supplier"
                      id={s.id}
                      active={s.active}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ─── Compradores ───────────────────────────────────────────────────────────────

function BuyerFields({ buyer }: { buyer?: Buyer }): React.JSX.Element {
  return (
    <>
      {buyer && <input type="hidden" name="id" value={buyer.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="buy-name">Nombre</Label>
          <Input
            id="buy-name"
            name="name"
            required
            defaultValue={buyer?.name}
          />
        </div>
        <div>
          <Label htmlFor="buy-code">Código</Label>
          <Input
            id="buy-code"
            name="code"
            required
            defaultValue={buyer?.code}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="buy-country">País</Label>
          <Input
            id="buy-country"
            name="country"
            required
            defaultValue={buyer?.country ?? "ES"}
          />
        </div>
        <div>
          <Label htmlFor="buy-holdedId">ID Holded</Label>
          <Input
            id="buy-holdedId"
            name="holdedId"
            defaultValue={buyer?.holdedId ?? ""}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="buy-notes">Notas</Label>
        <Textarea
          id="buy-notes"
          name="notes"
          defaultValue={buyer?.notes ?? ""}
        />
      </div>
    </>
  );
}

export function BuyersSection({
  buyers,
}: {
  buyers: Buyer[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Compradores (${buyers.length})`}
        action={
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus className="w-4 h-4" /> Nuevo comprador
              </Button>
            }
            title="Nuevo comprador"
            action={saveBuyerAction}
            submitLabel="Crear"
          >
            {() => <BuyerFields />}
          </EntityDialog>
        }
      />
      {buyers.length === 0 ? (
        <EmptyState
          title="No hay compradores"
          description="Crea el primer comprador."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código</TH>
              <TH>País</TH>
              <TH>Holded</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {buyers.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.name}</TD>
                <TD>{b.code}</TD>
                <TD>{b.country}</TD>
                <TD>{b.holdedId ? <Badge tone="blue">Sí</Badge> : "—"}</TD>
                <TD>
                  <ActiveBadge active={b.active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                      }
                      title={`Editar · ${b.name}`}
                      action={saveBuyerAction}
                      submitLabel="Guardar"
                    >
                      {() => <BuyerFields buyer={b} />}
                    </EntityDialog>
                    <ToggleActiveButton
                      entity="buyer"
                      id={b.id}
                      active={b.active}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ─── Transportistas ────────────────────────────────────────────────────────────

function CarrierFields({ carrier }: { carrier?: Carrier }): React.JSX.Element {
  return (
    <>
      {carrier && <input type="hidden" name="id" value={carrier.id} />}
      <div>
        <Label htmlFor="car-name">Nombre</Label>
        <Input
          id="car-name"
          name="name"
          required
          defaultValue={carrier?.name}
        />
      </div>
      <div>
        <Label htmlFor="car-holdedId">ID Holded (opcional)</Label>
        <Input
          id="car-holdedId"
          name="holdedId"
          defaultValue={carrier?.holdedId ?? ""}
        />
      </div>
    </>
  );
}

export function CarriersSection({
  carriers,
}: {
  carriers: Carrier[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Transportistas (${carriers.length})`}
        action={
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus className="w-4 h-4" /> Nuevo transportista
              </Button>
            }
            title="Nuevo transportista"
            action={saveCarrierAction}
            submitLabel="Crear"
          >
            {() => <CarrierFields />}
          </EntityDialog>
        }
      />
      {carriers.length === 0 ? (
        <EmptyState
          title="No hay transportistas"
          description="Crea el primer transportista."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Holded</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {carriers.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD>
                  {c.holdedId ? (
                    <Badge tone="blue">{c.holdedId}</Badge>
                  ) : (
                    <span className="text-[var(--color-muted)]">—</span>
                  )}
                </TD>
                <TD>
                  <ActiveBadge active={c.active} />
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <EntityDialog
                      trigger={
                        <Button size="sm" variant="outline">
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </Button>
                      }
                      title={`Editar · ${c.name}`}
                      action={saveCarrierAction}
                      submitLabel="Guardar"
                    >
                      {() => <CarrierFields carrier={c} />}
                    </EntityDialog>
                    <ToggleActiveButton
                      entity="carrier"
                      id={c.id}
                      active={c.active}
                    />
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ─── Almacenes y Zonas ─────────────────────────────────────────────────────────

function WarehouseFields({
  warehouse,
}: {
  warehouse?: WarehouseWithZones;
}): React.JSX.Element {
  return (
    <>
      {warehouse && <input type="hidden" name="id" value={warehouse.id} />}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="wh-name">Nombre</Label>
          <Input
            id="wh-name"
            name="name"
            required
            defaultValue={warehouse?.name}
          />
        </div>
        <div>
          <Label htmlFor="wh-code">Código</Label>
          <Input
            id="wh-code"
            name="code"
            required
            defaultValue={warehouse?.code}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="wh-location">Ubicación</Label>
        <Input
          id="wh-location"
          name="location"
          defaultValue={warehouse?.location ?? ""}
        />
      </div>
    </>
  );
}

function ZoneFields({
  warehouseId,
  zone,
}: {
  warehouseId: string;
  zone?: WarehouseWithZones["zones"][number];
}): React.JSX.Element {
  return (
    <>
      {zone && <input type="hidden" name="id" value={zone.id} />}
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="zone-name">Nombre</Label>
          <Input
            id="zone-name"
            name="name"
            required
            defaultValue={zone?.name}
          />
        </div>
        <div>
          <Label htmlFor="zone-code">Código</Label>
          <Input
            id="zone-code"
            name="code"
            required
            defaultValue={zone?.code}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="zone-maxCapacity">Capacidad máxima (sacas)</Label>
        <Input
          id="zone-maxCapacity"
          name="maxCapacity"
          type="number"
          min={1}
          required
          defaultValue={zone?.maxCapacity}
        />
      </div>
    </>
  );
}

/** Botón para borrar una zona (solo si no tiene sacas). */
function DeleteZoneButton({
  id,
  sackCount,
}: {
  id: string;
  sackCount: number;
}): React.JSX.Element {
  const [state, action] = useActionState(deleteZoneAction, INITIAL);
  const disabled = sackCount > 0;
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        size="sm"
        variant="danger"
        disabled={disabled}
        title={
          disabled ? "No se puede borrar: la zona tiene sacas" : "Borrar zona"
        }
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
      {state.error && (
        <span className="ml-2 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}

export function WarehousesSection({
  warehouses,
}: {
  warehouses: WarehouseWithZones[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Almacenes (${warehouses.length})`}
        action={
          <EntityDialog
            trigger={
              <Button size="sm">
                <Plus className="w-4 h-4" /> Nuevo almacén
              </Button>
            }
            title="Nuevo almacén"
            action={saveWarehouseAction}
            submitLabel="Crear"
          >
            {() => <WarehouseFields />}
          </EntityDialog>
        }
      />
      {warehouses.length === 0 ? (
        <EmptyState
          icon={WarehouseIcon}
          title="No hay almacenes"
          description="Crea el primer almacén y sus zonas."
        />
      ) : (
        <div className="space-y-6">
          {warehouses.map((w) => (
            <div
              key={w.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--color-foreground)]">
                    {w.name}
                  </span>
                  <Badge tone="neutral">{w.code}</Badge>
                  {w.location && (
                    <span className="text-sm text-[var(--color-muted)]">
                      {w.location}
                    </span>
                  )}
                  <ActiveBadge active={w.active} />
                </div>
                <div className="flex gap-2">
                  <EntityDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil className="w-3.5 h-3.5" /> Editar
                      </Button>
                    }
                    title={`Editar almacén · ${w.name}`}
                    action={saveWarehouseAction}
                    submitLabel="Guardar"
                  >
                    {() => <WarehouseFields warehouse={w} />}
                  </EntityDialog>
                  <ToggleActiveButton
                    entity="warehouse"
                    id={w.id}
                    active={w.active}
                  />
                  <EntityDialog
                    trigger={
                      <Button size="sm" variant="secondary">
                        <Plus className="w-3.5 h-3.5" /> Zona
                      </Button>
                    }
                    title={`Nueva zona · ${w.name}`}
                    action={saveZoneAction}
                    submitLabel="Crear zona"
                  >
                    {() => <ZoneFields warehouseId={w.id} />}
                  </EntityDialog>
                </div>
              </div>

              {w.zones.length === 0 ? (
                <p className="px-5 py-4 text-sm text-[var(--color-muted)]">
                  Sin zonas. Añade la primera zona a este almacén.
                </p>
              ) : (
                <Table className="border-0">
                  <THead>
                    <TR>
                      <TH>Zona</TH>
                      <TH>Código</TH>
                      <TH>Capacidad</TH>
                      <TH>Sacas</TH>
                      <TH className="text-right">Acciones</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {w.zones.map((z) => (
                      <TR key={z.id}>
                        <TD className="font-medium">{z.name}</TD>
                        <TD>{z.code}</TD>
                        <TD>{z.maxCapacity}</TD>
                        <TD>{z._count.sacks}</TD>
                        <TD className="text-right">
                          <div className="flex justify-end gap-2">
                            <EntityDialog
                              trigger={
                                <Button size="sm" variant="outline">
                                  <Pencil className="w-3.5 h-3.5" /> Editar
                                </Button>
                              }
                              title={`Editar zona · ${z.name}`}
                              action={saveZoneAction}
                              submitLabel="Guardar"
                            >
                              {() => <ZoneFields warehouseId={w.id} zone={z} />}
                            </EntityDialog>
                            <DeleteZoneButton
                              id={z.id}
                              sackCount={z._count.sacks}
                            />
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Usuarios ──────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  OPERARIO: "Operario",
  ADMINISTRACION: "Administración",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

const ROLE_TONES: Record<UserRole, Tone> = {
  OPERARIO: "sky",
  ADMINISTRACION: "amber",
  MANAGER: "purple",
  ADMIN: "red",
};

/**
 * Listado de usuarios (solo lectura). El alta, cambio de rol, reseteo de
 * contraseña y activación viven en la página /usuarios para no duplicar lógica.
 */
export function UsersSection({
  users,
  currentUserId,
}: {
  users: UserListItem[];
  currentUserId: string;
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Usuarios (${users.length})`}
        action={
          <Link href="/usuarios">
            <Button size="sm" variant="outline">
              <ExternalLink className="w-3.5 h-3.5" /> Gestionar usuarios
            </Button>
          </Link>
        }
      />
      {users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No hay usuarios"
          description="Crea el primer usuario desde la página de Usuarios."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Usuario</TH>
              <TH>Email</TH>
              <TH>Rol</TH>
              <TH>Estado</TH>
              <TH>Alta</TH>
            </TR>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      (tú)
                    </span>
                  )}
                </TD>
                <TD>{u.email}</TD>
                <TD>
                  <Badge tone={ROLE_TONES[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                </TD>
                <TD>
                  <ActiveBadge active={u.active} />
                </TD>
                <TD>{formatDate(u.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}

// ─── Feedback de guardado (formularios de una sola isla) ─────────────────────────

/** Mensaje de éxito/error bajo un formulario de configuración persistente. */
function FormFeedback({ state }: { state: ActionState }): React.JSX.Element {
  return (
    <div aria-live="polite" className="min-h-5">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && state.message && (
        <p className="text-sm text-green-600">{state.message}</p>
      )}
    </div>
  );
}

// ─── Calidad (rangos) ────────────────────────────────────────────────────────────

/**
 * Rangos mínimo/máximo por parámetro de calidad. Editable y persistente en
 * `config.quality_ranges` (misma forma que lee `quality.service`). Campo vacío =
 * sin límite configurado (cae al valor por defecto en el control de calidad).
 */
export function QualitySection({
  ranges,
}: {
  ranges: QualityRanges;
}): React.JSX.Element {
  const [state, action] = useActionState(saveQualityRangesAction, INITIAL);
  return (
    <section>
      <form action={action}>
        <SectionHeader
          title="Rangos de Calidad"
          action={<SubmitButton>Guardar rangos</SubmitButton>}
        />
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Rangos mínimo y máximo aceptables por parámetro. Los valores fuera de
          rango se marcan como NOK en el control de calidad. Deja un campo vacío
          para no aplicar límite en ese extremo.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SAMPLE_MEASURE_KEYS.map((key) => {
            const color = SAMPLE_MEASURE_COLORS[key];
            return (
              <div
                key={key}
                className="rounded-xl border p-4"
                style={{
                  backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                  borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
                }}
              >
                <h3 className="mb-3 text-sm font-semibold" style={{ color }}>
                  {SAMPLE_MEASURE_LABELS[key]} ({SAMPLE_MEASURE_UNITS[key]})
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`${key}_min`} className="text-xs">
                      Mínimo
                    </Label>
                    <Input
                      id={`${key}_min`}
                      name={`${key}_min`}
                      type="number"
                      step="any"
                      className="mt-1 bg-[var(--color-surface)]"
                      aria-label={`${SAMPLE_MEASURE_LABELS[key]} mínimo`}
                      defaultValue={ranges[key].min ?? ""}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${key}_max`} className="text-xs">
                      Máximo
                    </Label>
                    <Input
                      id={`${key}_max`}
                      name={`${key}_max`}
                      type="number"
                      step="any"
                      className="mt-1 bg-[var(--color-surface)]"
                      aria-label={`${SAMPLE_MEASURE_LABELS[key]} máximo`}
                      defaultValue={ranges[key].max ?? ""}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4">
          <FormFeedback state={state} />
        </div>
      </form>
    </section>
  );
}

// ─── Costes ──────────────────────────────────────────────────────────────────────

const COST_FIELDS: {
  name: keyof CostsConfig;
  label: string;
  hint: string;
  color: string;
}[] = [
  {
    name: "processingPerSack",
    label: "Coste de Procesado por Saca (€)",
    hint: "Coste fijo aplicado a cada saca de producto terminado.",
    color: "#f59e0b", // amber
  },
  {
    name: "palletCost",
    label: "Coste de palé (€)",
    hint: "Se autocalcula con la última compra de palés en Consumibles.",
    color: "#3b82f6", // blue
  },
  {
    name: "emptySackCost",
    label: "Coste de saca vacía (€)",
    hint: "Se autocalcula con la última compra de sacas vacías en Consumibles.",
    color: "#8b5cf6", // purple
  },
];

/**
 * Costes fijos de procesado y consumibles. Editable y persistente en
 * `config.costs`. Se usan para calcular el coste total de cada saca y lote.
 */
export function CostsSection({
  costs,
}: {
  costs: CostsConfig;
}): React.JSX.Element {
  const [state, action] = useActionState(saveCostsAction, INITIAL);
  return (
    <section>
      <form action={action}>
        <SectionHeader
          title="Sistema de Costes"
          action={<SubmitButton>Guardar costes</SubmitButton>}
        />
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Costes de procesado y consumibles usados para calcular el coste total
          de cada saca y de cada lote de salida.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {COST_FIELDS.map((c) => (
            <div
              key={c.name}
              className="rounded-xl border p-4"
              style={{
                backgroundColor: `color-mix(in srgb, ${c.color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${c.color} 32%, transparent)`,
              }}
            >
              <Label
                htmlFor={`cost-${c.name}`}
                className="font-semibold"
                style={{ color: c.color }}
              >
                {c.label}
              </Label>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{c.hint}</p>
              <Input
                id={`cost-${c.name}`}
                name={c.name}
                type="number"
                step="0.01"
                min={0}
                required
                className="mt-3 bg-[var(--color-surface)]"
                defaultValue={costs[c.name]}
              />
            </div>
          ))}
        </div>
        <div className="mt-4">
          <FormFeedback state={state} />
        </div>
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h3 className="mb-2 text-sm font-medium text-[var(--color-foreground)]">
            Fórmula del coste de lote
          </h3>
          <p className="font-mono text-sm text-[var(--color-muted)]">
            Total lote = Σ (coste materia prima) + Σ (procesado × nº sacas) + (1
            × palé) + (nº sacas × saca vacía)
          </p>
        </div>
      </form>
    </section>
  );
}
