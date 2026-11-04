"use client";

import { useActionState, useRef, useState } from "react";
import { Warehouse } from "lucide-react";
import { LotType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import { formatKg } from "@/lib/utils";
import {
  createManualLotAction,
  listStockSacksForLotAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = { ok: false };

const TYPE_LABEL: Record<LotType, string> = {
  PRODUCTO_TERMINADO: "Producto Terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
};

export interface StockMaterialOption {
  id: string;
  name: string;
  count: number;
}

interface StockSack {
  id: string;
  qrCode: string;
  weight: number;
  zoneLabel: string | null;
}

interface ZoneOption {
  id: string;
  name: string;
}

/**
 * Crear un lote de salida con sacas que están EN ALMACÉN (stock, altas
 * manuales…). Un lote lleva un solo material, así que se elige primero el
 * material; después se marcan hasta `maxSacks` sacas. Las sacas pasan al estado
 * del lote y dejan de contar como stock; si luego se sacan del lote, vuelven a
 * almacén a la zona que se indique.
 */
export function CreateLotFromStockDialog({
  type,
  materials,
  zones,
  maxSacks,
}: {
  type: LotType;
  materials: StockMaterialOption[];
  zones: ZoneOption[];
  maxSacks: number;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<StockSack[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Para ignorar respuestas viejas si el usuario cambia el filtro rápido.
  const request = useRef(0);

  const [state, action] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await createManualLotAction(prev, formData);
      if (result.ok) {
        reset();
        setOpen(false);
      }
      return result;
    },
    INITIAL,
  );

  function reset(): void {
    setMaterialId("");
    setZoneId("");
    setSearch("");
    setItems([]);
    setTotal(0);
    setSelected([]);
    setLoadError(null);
  }

  async function load(next: {
    materialId: string;
    zoneId: string;
    search: string;
  }): Promise<void> {
    if (!next.materialId) {
      setItems([]);
      setTotal(0);
      return;
    }
    const id = ++request.current;
    setLoading(true);
    setLoadError(null);
    const res = await listStockSacksForLotAction(next);
    if (id !== request.current) return;
    setLoading(false);
    if (!res.ok) {
      setLoadError(res.error ?? "Error al cargar las sacas");
      return;
    }
    setItems(res.items ?? []);
    setTotal(res.total ?? 0);
    // Se conservan solo las marcadas que siguen en la lista.
    const ids = new Set((res.items ?? []).map((s) => s.id));
    setSelected((prev) => prev.filter((x) => ids.has(x)));
  }

  function toggle(id: string): void {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < maxSacks
          ? [...prev, id]
          : prev,
    );
  }

  const selectedKg = items
    .filter((s) => selected.includes(s.id))
    .reduce((sum, s) => sum + s.weight, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Warehouse className="w-3.5 h-3.5" /> Crear lote desde almacén
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Crear lote desde almacén · ${TYPE_LABEL[type]}`}
        description={`Elige un material y marca las sacas de almacén que van en el lote (máximo ${maxSacks}). Dejarán de contar como stock de almacén; si luego sacas una del lote, vuelve a almacén a la zona que indiques.`}
      >
        {materials.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No hay sacas en almacén disponibles para agrupar.
          </p>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="type" value={type} />
            <input
              type="hidden"
              name="sackIds"
              value={JSON.stringify(selected)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="stock-lot-material">Material</Label>
                <Select
                  id="stock-lot-material"
                  value={materialId}
                  onChange={(e) => {
                    setMaterialId(e.target.value);
                    setSelected([]);
                    void load({
                      materialId: e.target.value,
                      zoneId,
                      search,
                    });
                  }}
                >
                  <option value="" disabled>
                    Selecciona…
                  </option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.count})
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="stock-lot-zone">Zona (opcional)</Label>
                <Select
                  id="stock-lot-zone"
                  value={zoneId}
                  onChange={(e) => {
                    setZoneId(e.target.value);
                    void load({ materialId, zoneId: e.target.value, search });
                  }}
                >
                  <option value="">Todas</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="stock-lot-search">Buscar por QR</Label>
                <Input
                  id="stock-lot-search"
                  value={search}
                  placeholder="SACK-…"
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void load({ materialId, zoneId, search });
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!materialId}
                onClick={() => void load({ materialId, zoneId, search })}
              >
                Buscar
              </Button>
            </div>

            {!materialId ? (
              <p className="text-sm text-[var(--color-muted)]">
                Elige un material para ver sus sacas en almacén.
              </p>
            ) : loading ? (
              <p className="text-sm text-[var(--color-muted)]">Cargando…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">
                No hay sacas en almacén con esos filtros.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                  <span>
                    Mostrando {items.length} de {total} sacas
                  </span>
                  <button
                    type="button"
                    className="text-[var(--color-primary)] hover:underline"
                    onClick={() =>
                      setSelected(items.slice(0, maxSacks).map((s) => s.id))
                    }
                  >
                    Marcar las primeras {Math.min(maxSacks, items.length)}
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                  {items.map((s) => {
                    const checked = selected.includes(s.id);
                    const disabled = !checked && selected.length >= maxSacks;
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${
                          disabled ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggle(s.id)}
                        />
                        <span className="font-mono text-xs">{s.qrCode}</span>
                        <span className="text-[var(--color-muted)] truncate">
                          {s.zoneLabel ?? "Sin ubicación"}
                        </span>
                        <span className="ml-auto">{formatKg(s.weight)}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              {selected.length}/{maxSacks} sacas seleccionadas
              {selected.length > 0 && ` · ${formatKg(selectedKg)}`}
            </p>
            {(loadError || state.error) && (
              <p className="text-sm text-red-600">{loadError ?? state.error}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <SubmitButton disabled={selected.length === 0}>
                Crear lote ({selected.length})
              </SubmitButton>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
