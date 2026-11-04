import type { Prisma } from "@prisma/client";

/**
 * Proveedor de una saca: el de su contenedor si lo tiene; si no (altas manuales,
 * stock inicial), el que se le haya asignado a la propia saca. Null = sin
 * proveedor.
 */
export interface SackSupplierSource {
  container?: { supplier: { id: string; name: string } } | null;
  supplier?: { id: string; name: string } | null;
}

export function sackSupplier(
  sack: SackSupplierSource,
): { id: string; name: string } | null {
  return sack.container?.supplier ?? sack.supplier ?? null;
}

/**
 * Condición de Prisma equivalente a `sackSupplier(sack).id ∈ supplierIds`: el
 * proveedor de su contenedor o, si no tiene contenedor, el suyo propio.
 */
export function sackSupplierIn(supplierIds: string[]): Prisma.SackWhereInput {
  return {
    OR: [
      { container: { is: { supplierId: { in: supplierIds } } } },
      { containerId: null, supplierId: { in: supplierIds } },
    ],
  };
}

/** Sacas sin proveedor: sin contenedor y sin proveedor propio. */
export const SACK_WITHOUT_SUPPLIER: Prisma.SackWhereInput = {
  containerId: null,
  supplierId: null,
};
