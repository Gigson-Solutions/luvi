"use client";

import { useActionState, useState } from "react";
import {
  Plus,
  Pencil,
  Power,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { MaterialType } from "@prisma/client";
import type { Material, Supplier, Buyer, Carrier } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import type { WarehouseWithZones } from "@/lib/services/config.service";
import {
  saveMaterialAction,
  saveSupplierAction,
  saveBuyerAction,
  saveCarrierAction,
  saveWarehouseAction,
  saveZoneAction,
  deleteZoneAction,
  toggleActiveAction,
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

type TabKey =
  "materiales" | "proveedores" | "compradores" | "transportistas" | "almacenes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "materiales", label: "Materiales" },
  { key: "proveedores", label: "Proveedores" },
  { key: "compradores", label: "Compradores" },
  { key: "transportistas", label: "Transportistas" },
  { key: "almacenes", label: "Almacenes y Zonas" },
];

interface ConfigSectionsProps {
  materials: Material[];
  suppliers: Supplier[];
  buyers: Buyer[];
  carriers: Carrier[];
  warehouses: WarehouseWithZones[];
}

export function ConfigSections(props: ConfigSectionsProps): React.JSX.Element {
  const [tab, setTab] = useState<TabKey>("materiales");

  return (
    <div>
      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)] mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (tab === t.key
                ? "border-[var(--color-primary)] text-[var(--color-foreground)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-foreground)]")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "materiales" && <MaterialsSection materials={props.materials} />}
      {tab === "proveedores" && (
        <SuppliersSection suppliers={props.suppliers} />
      )}
      {tab === "compradores" && <BuyersSection buyers={props.buyers} />}
      {tab === "transportistas" && (
        <CarriersSection carriers={props.carriers} />
      )}
      {tab === "almacenes" && (
        <WarehousesSection warehouses={props.warehouses} />
      )}
    </div>
  );
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
  entity: "material" | "supplier" | "buyer" | "carrier" | "warehouse";
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
}: {
  material?: Material;
}): React.JSX.Element {
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
        <Label htmlFor="mat-type">Tipo</Label>
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

function MaterialsSection({
  materials,
}: {
  materials: Material[];
}): React.JSX.Element {
  return (
    <section>
      <SectionHeader
        title={`Materiales (${materials.length})`}
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
            {() => <MaterialFields />}
          </EntityDialog>
        }
      />
      {materials.length === 0 ? (
        <EmptyState
          title="No hay materiales"
          description="Crea el primer material del catálogo."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Código</TH>
              <TH>Tipo</TH>
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {materials.map((m) => (
              <TR key={m.id}>
                <TD className="font-medium">{m.name}</TD>
                <TD>{m.code}</TD>
                <TD>{MATERIAL_TYPE_LABELS[m.type]}</TD>
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
                      {() => <MaterialFields material={m} />}
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

function SuppliersSection({
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

function BuyersSection({ buyers }: { buyers: Buyer[] }): React.JSX.Element {
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
    </>
  );
}

function CarriersSection({
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
              <TH>Estado</TH>
              <TH className="text-right">Acciones</TH>
            </TR>
          </THead>
          <TBody>
            {carriers.map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.name}</TD>
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

function WarehousesSection({
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
