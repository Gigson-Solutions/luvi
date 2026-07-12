import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SackStatus } from "@prisma/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { SackStatusBadge } from "@/components/ui/status-badge";
import { formatKg, formatDate } from "@/lib/utils";
import {
  getSackDetail,
  getWarehouseFilterData,
} from "@/lib/services/warehouse.service";
import { MoveSackDialog } from "../warehouse-client";

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-sm text-[var(--color-muted)]">{label}</span>
      <span className="text-sm text-[var(--color-foreground)] text-right">
        {value}
      </span>
    </div>
  );
}

export default async function SackDetailPage({
  params,
}: {
  params: Promise<{ sackId: string }>;
}): Promise<React.JSX.Element> {
  const { sackId } = await params;
  const [sack, filterData] = await Promise.all([
    getSackDetail(sackId),
    getWarehouseFilterData(),
  ]);

  if (!sack) notFound();

  return (
    <div>
      <Link
        href="/almacen"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver al almacén
      </Link>

      <PageHeader
        title={`Saca ${sack.qrCode}`}
        description="Ciclo de vida y ubicación actual de la saca."
        actions={
          sack.status === SackStatus.EN_ALMACEN ? (
            <MoveSackDialog
              sackId={sack.id}
              qrCode={sack.qrCode}
              currentZoneId={sack.zoneId}
              zones={filterData.zones}
              size="md"
              variant="primary"
            />
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Datos de la saca */}
        <Card>
          <CardHeader>
            <CardTitle>Saca</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Código QR" value={sack.qrCode} />
            <Field
              label="Estado"
              value={<SackStatusBadge status={sack.status} />}
            />
            <Field
              label="Material"
              value={`${sack.material.name} (${sack.material.code})`}
            />
            <Field label="Peso" value={formatKg(sack.weight)} />
            <Field
              label="Nº saca (lote contenedor)"
              value={sack.batchNumber ?? "—"}
            />
            {sack.notes && <Field label="Notas" value={sack.notes} />}
          </CardContent>
        </Card>

        {/* Ubicación */}
        <Card>
          <CardHeader>
            <CardTitle>Ubicación</CardTitle>
          </CardHeader>
          <CardContent>
            {sack.zone ? (
              <>
                <Field
                  label="Almacén"
                  value={`${sack.zone.warehouse.name} (${sack.zone.warehouse.code})`}
                />
                <Field
                  label="Zona"
                  value={`${sack.zone.name} · ${sack.zone.code}`}
                />
                {sack.zone.warehouse.location && (
                  <Field
                    label="Localización"
                    value={sack.zone.warehouse.location}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Sin ubicación asignada.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Origen — contenedor de recepción */}
        <Card>
          <CardHeader>
            <CardTitle>Origen (contenedor)</CardTitle>
          </CardHeader>
          <CardContent>
            {sack.container ? (
              <>
                <Field label="Referencia" value={sack.container.reference} />
                <Field label="Proveedor" value={sack.container.supplier.name} />
                {sack.container.billOfLading && (
                  <Field
                    label="Bill of Lading"
                    value={sack.container.billOfLading}
                  />
                )}
                {sack.container.actualWeight != null && (
                  <Field
                    label="Peso contenedor"
                    value={formatKg(sack.container.actualWeight)}
                  />
                )}
                {sack.container.arrivedAt && (
                  <Field
                    label="Recibido"
                    value={formatDate(sack.container.arrivedAt, true)}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">
                Esta saca no procede de una recepción (saca de salida de
                producción).
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lote de producción (si aplica) */}
        {sack.lot && (
          <Card>
            <CardHeader>
              <CardTitle>Lote de producción</CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Nº de lote" value={sack.lot.lotNumber} />
              <Field label="Tipo" value={sack.lot.type} />
              <Field label="Material" value={sack.lot.material.name} />
              <Field
                label="Producido"
                value={formatDate(sack.lot.producedAt, true)}
              />
            </CardContent>
          </Card>
        )}

        {/* Fechas */}
        <Card>
          <CardHeader>
            <CardTitle>Fechas</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Creada" value={formatDate(sack.createdAt, true)} />
            <Field
              label="Última actualización"
              value={formatDate(sack.updatedAt, true)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
