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
import { UserRole } from "@prisma/client";
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
import { formatDate, formatEuro } from "@/lib/utils";
import type {
  WarehouseWithZones,
  MaterialWithCategory,
} from "@/lib/services/config.service";
import type { QualityRangeSetSummary } from "@/lib/services/quality.service";
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
  saveQualityRangeSetAction,
  deleteQualityRangeSetAction,
  setCategoryRangeSetAction,
  saveCostsAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

/** Consumible en los selectores de consumibles predeterminados por producto. */
export interface ConsumableOption {
  id: string;
  name: string;
  unit: string;
  unitCost: number;
}

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
  consumables,
  rangeSets,
}: {
  material?: MaterialWithCategory;
  categories: MaterialCategory[];
  consumables: ConsumableOption[];
  rangeSets: QualityRangeSetSummary[];
}): React.JSX.Element {
  const activeCategories = categories.filter(
    (c) => c.active || c.id === material?.categoryId,
  );
  const defaults = new Map(
    (material?.defaultConsumables ?? []).map((d) => [d.consumableId, d]),
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
      <div>
        <Label htmlFor="mat-ranges">Rangos de calidad</Label>
        <Select
          id="mat-ranges"
          name="qualityRangeSetId"
          defaultValue={material?.qualityRangeSetId ?? ""}
        >
          <option value="">Heredar del tipo de material</option>
          {rangeSets
            .filter((r) => r.active || r.id === material?.qualityRangeSetId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </Select>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Se cargan solos en los análisis de este producto. Sin conjunto propio
          se usan los del tipo de material y, en su defecto, los generales.
        </p>
      </div>

      <div>
        <Label>Consumibles predeterminados</Label>
        {consumables.length === 0 ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            No hay consumibles dados de alta todavía.
          </p>
        ) : (
          <>
            <div className="mt-1 max-h-44 space-y-1 overflow-auto rounded-lg border border-[var(--color-border)] p-2">
              {consumables.map((c) => {
                const preset = defaults.get(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      id={`cons_${c.id}`}
                      name={`cons_${c.id}`}
                      value="1"
                      defaultChecked={preset != null}
                      className="h-4 w-4 accent-[var(--color-primary)]"
                    />
                    <label htmlFor={`cons_${c.id}`} className="flex-1">
                      {c.name}
                      <span className="ml-1 text-xs text-[var(--color-muted)]">
                        {formatEuro(c.unitCost)}/{c.unit}
                      </span>
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      name={`consQty_${c.id}`}
                      defaultValue={preset?.quantity ?? 1}
                      className="h-8 w-20 text-xs"
                      aria-label={`Cantidad de ${c.name} por saca`}
                    />
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Se cargan marcados al registrar una saca de este producto; el
              operario puede desmarcarlos como excepción.
            </p>
          </>
        )}
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
  consumables,
  rangeSets,
}: {
  materials: MaterialWithCategory[];
  categories: MaterialCategory[];
  consumables: ConsumableOption[];
  rangeSets: QualityRangeSetSummary[];
}): React.JSX.Element {
  // Filtros client-side, combinables entre sí:
  //   categoría ("" = todas, "none" = sin categoría), estado y búsqueda libre.
  const [filter, setFilter] = useState<string>("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return materials.filter((m) => {
      if (filter === "none" ? !!m.categoryId : filter && m.categoryId !== filter)
        return false;
      if (status === "active" && !m.active) return false;
      if (status === "inactive" && m.active) return false;
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.code.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [materials, filter, status, query]);
  const hasFilters = filter !== "" || status !== "" || query !== "";

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
            {() => (
              <MaterialFields
                categories={categories}
                consumables={consumables}
                rangeSets={rangeSets}
              />
            )}
          </EntityDialog>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          id="mat-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="w-auto min-w-56"
        />
        <Label
          htmlFor="mat-filter"
          className="text-xs text-[var(--color-muted)]"
        >
          Categoría
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
        <Label
          htmlFor="mat-status"
          className="text-xs text-[var(--color-muted)]"
        >
          Estado
        </Label>
        <Select
          id="mat-status"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as "" | "active" | "inactive")
          }
          className="w-auto min-w-36"
        >
          <option value="">Todos</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </Select>
        {hasFilters && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFilter("");
              setStatus("");
              setQuery("");
            }}
          >
            Limpiar filtros
          </Button>
        )}
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
              <TH>Categoría</TH>
              <TH>Consumibles</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.code}</TD>
                <TD>
                  {m.category ? (
                    <Badge tone="blue">{m.category.name}</Badge>
                  ) : (
                    <span className="text-[var(--color-muted)]">—</span>
                  )}
                </TD>
                <TD className="text-xs text-[var(--color-muted)]">
                  {m.defaultConsumables.length === 0
                    ? "—"
                    : m.defaultConsumables
                        .map((d) => `${d.quantity}× ${d.consumable.name}`)
                        .join(", ")}
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
                        <MaterialFields
                          material={m}
                          categories={categories}
                          consumables={consumables}
                          rangeSets={rangeSets}
                        />
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

function MaterialCategoryFields({
  rangeSets,
}: {
  rangeSets: QualityRangeSetSummary[];
}): React.JSX.Element {
  return (
    <>
      <div>
        <Label htmlFor="cat-name">Nombre</Label>
        <Input id="cat-name" name="name" required />
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Usa los nombres estándar (Materia Prima, Producto Terminado,
          Subproducto, Rechazo) para que el tipo se clasifique solo en el flujo.
        </p>
      </div>
      <div>
        <Label htmlFor="cat-ranges">Rangos de calidad</Label>
        <Select id="cat-ranges" name="qualityRangeSetId" defaultValue="">
          <option value="">Rangos generales</option>
          {rangeSets
            .filter((r) => r.active)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </Select>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Los productos de este tipo sin conjunto propio usarán estos rangos.
        </p>
      </div>
    </>
  );
}

/** Select en línea que asigna el conjunto de rangos de un tipo de material. */
function CategoryRangeSetSelect({
  category,
  rangeSets,
}: {
  category: MaterialCategory;
  rangeSets: QualityRangeSetSummary[];
}): React.JSX.Element {
  const [, action] = useActionState(setCategoryRangeSetAction, INITIAL);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={category.id} />
      <Select
        name="qualityRangeSetId"
        defaultValue={category.qualityRangeSetId ?? ""}
        className="h-8 w-auto min-w-44 text-xs"
        aria-label={`Rangos de calidad de ${category.name}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Rangos generales</option>
        {rangeSets
          .filter((r) => r.active || r.id === category.qualityRangeSetId)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
      </Select>
    </form>
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
  rangeSets,
}: {
  categories: MaterialCategory[];
  rangeSets: QualityRangeSetSummary[];
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
              {() => <MaterialCategoryFields rangeSets={rangeSets} />}
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
              <TH>Rangos de calidad</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {categories.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
                <TD>
                  <CategoryRangeSetSelect category={c} rangeSets={rangeSets} />
                </TD>
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
/** Rejilla de 6 parámetros con sus min/max; se reutiliza en rangos y conjuntos. */
function RangeGrid({
  ranges,
  idPrefix = "",
}: {
  ranges: QualityRanges;
  idPrefix?: string;
}): React.JSX.Element {
  return (
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
                <Label htmlFor={`${idPrefix}${key}_min`} className="text-xs">
                  Mínimo
                </Label>
                <Input
                  id={`${idPrefix}${key}_min`}
                  name={`${key}_min`}
                  type="number"
                  step="any"
                  className="mt-1 bg-[var(--color-surface)]"
                  aria-label={`${SAMPLE_MEASURE_LABELS[key]} mínimo`}
                  defaultValue={ranges[key].min ?? ""}
                />
              </div>
              <div>
                <Label htmlFor={`${idPrefix}${key}_max`} className="text-xs">
                  Máximo
                </Label>
                <Input
                  id={`${idPrefix}${key}_max`}
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
  );
}

/** Resumen legible de un conjunto: solo los parámetros con algún límite. */
function rangeSummary(ranges: QualityRanges): string {
  const parts = SAMPLE_MEASURE_KEYS.filter(
    (k) => ranges[k].min != null || ranges[k].max != null,
  ).map((k) => {
    const { min, max } = ranges[k];
    const value =
      min != null && max != null
        ? `${min}–${max}`
        : min != null
          ? `≥ ${min}`
          : `≤ ${max}`;
    return `${SAMPLE_MEASURE_LABELS[k]} ${value}${SAMPLE_MEASURE_UNITS[k]}`;
  });
  return parts.length === 0 ? "Sin límites" : parts.join(" · ");
}

const EMPTY_RANGES: QualityRanges = {
  density: { min: null, max: null },
  pvc: { min: null, max: null },
  cola: { min: null, max: null },
  multicapas: { min: null, max: null },
  metal: { min: null, max: null },
  otros: { min: null, max: null },
};

/** Botón de borrado de un conjunto de rangos, con confirmación. */
function DeleteRangeSetButton({ id }: { id: string }): React.JSX.Element {
  const [, action] = useActionState(deleteQualityRangeSetAction, INITIAL);
  return (
    <form
      action={action}
      className="inline"
      onSubmit={(e) => {
        if (
          !window.confirm(
            "¿Eliminar este conjunto? Los productos que lo usen pasarán a los rangos generales.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="text-red-600 hover:text-red-700"
        aria-label="Eliminar conjunto"
      >
        <Trash2 className="w-4 h-4" />
      </Button>
    </form>
  );
}

export function QualitySection({
  ranges,
  rangeSets,
}: {
  ranges: QualityRanges;
  rangeSets: QualityRangeSetSummary[];
}): React.JSX.Element {
  const [state, action] = useActionState(saveQualityRangesAction, INITIAL);
  return (
    <section className="space-y-10">
      <form action={action}>
        <SectionHeader
          title="Rangos de Calidad (generales)"
          action={<SubmitButton>Guardar rangos</SubmitButton>}
        />
        <p className="mb-4 text-sm text-[var(--color-muted)]">
          Rangos mínimo y máximo aceptables por parámetro. Los valores fuera de
          rango se marcan como NOK en el control de calidad. Deja un campo vacío
          para no aplicar límite en ese extremo. Se aplican a los productos que
          no tengan un conjunto propio.
        </p>
        <RangeGrid ranges={ranges} />
        <div className="mt-4">
          <FormFeedback state={state} />
        </div>
      </form>

      <div>
        <SectionHeader
          title={`Conjuntos por producto o tipo (${rangeSets.length})`}
          action={
            <EntityDialog
              trigger={
                <Button size="sm">
                  <Plus className="w-4 h-4" /> Nuevo conjunto
                </Button>
              }
              title="Nuevo conjunto de rangos"
              description="Se asigna después a productos (en Materiales) o a tipos de material."
              action={saveQualityRangeSetAction}
              submitLabel="Crear"
            >
              {() => (
                <>
                  <div>
                    <Label htmlFor="set-name">Nombre</Label>
                    <Input
                      id="set-name"
                      name="name"
                      required
                      placeholder="Ej. PE Natural"
                    />
                  </div>
                  <RangeGrid ranges={EMPTY_RANGES} idPrefix="new-" />
                </>
              )}
            </EntityDialog>
          }
        />
        <p className="mb-3 text-sm text-[var(--color-muted)]">
          Cada análisis carga automáticamente el conjunto de su producto; si el
          producto no tiene, el de su tipo de material; y si tampoco, los rangos
          generales.
        </p>
        {rangeSets.length === 0 ? (
          <EmptyState
            title="No hay conjuntos de rangos"
            description="Crea un conjunto y asígnalo a los productos o tipos que lo necesiten."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Rangos</TH>
                <TH>Se aplica a</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {rangeSets.map((s) => (
                <TR key={s.id}>
                  <TD className="font-medium">{s.name}</TD>
                  <TD className="text-xs text-[var(--color-muted)]">
                    {rangeSummary(s.ranges)}
                  </TD>
                  <TD className="text-xs text-[var(--color-muted)]">
                    {[...s.categoryNames, ...s.materialNames].join(", ") || "—"}
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
                        action={saveQualityRangeSetAction}
                        submitLabel="Guardar"
                      >
                        {() => (
                          <>
                            <input type="hidden" name="id" value={s.id} />
                            <div>
                              <Label htmlFor={`set-name-${s.id}`}>Nombre</Label>
                              <Input
                                id={`set-name-${s.id}`}
                                name="name"
                                required
                                defaultValue={s.name}
                              />
                            </div>
                            <RangeGrid
                              ranges={s.ranges}
                              idPrefix={`${s.id}-`}
                            />
                          </>
                        )}
                      </EntityDialog>
                      <DeleteRangeSetButton id={s.id} />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
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
