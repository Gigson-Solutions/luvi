import Link from "next/link";
import { QrCode as QrCodeIcon, PackageSearch, Eye } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SackStatusBadge } from "@/components/ui/status-badge";
import { QrCode } from "@/components/qr/qr-code";
import { formatKg } from "@/lib/utils";
import {
  findSackByQrOrId,
  listRecentSacks,
  type QrSackDetail,
} from "@/lib/services/qr.service";
import { QrSearch } from "./qr-search";
import { QrPrintButton, type QrPrintJob } from "./qr-print-button";

export default async function QrPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";

  const [sack, recent] = await Promise.all([
    query ? findSackByQrOrId(query) : Promise.resolve(null),
    listRecentSacks(10),
  ]);

  return (
    <div>
      <PageHeader
        title="Gestión QR"
        description="Busca una saca por ID o código QR y reimprime su etiqueta."
      />

      <div className="max-w-xl mb-8">
        <QrSearch initialQuery={query} />
      </div>

      {sack ? (
        <div className="mb-10">
          <SackPanel sack={sack} />
        </div>
      ) : query ? (
        <div className="mb-10">
          <EmptyState
            icon={PackageSearch}
            title="No se encontró ninguna saca"
            description={`No hay ninguna saca con ID o código QR «${query}». Revisa el código e inténtalo de nuevo.`}
          />
        </div>
      ) : null}

      <RecentSacksTable rows={recent} activeQr={sack?.qrCode ?? null} />
    </div>
  );
}

/** Construye el trabajo de impresión a partir del detalle de la saca. */
function toPrintJob(sack: QrSackDetail): QrPrintJob {
  return {
    sackId: sack.id,
    qrCode: sack.qrCode,
    weight: sack.weight,
    material: sack.materialName,
    warehouse: sack.warehouseName ?? "",
    batchNumber: sack.lotNumber ?? sack.batchNumber ?? undefined,
    codigoProducto: sack.materialCode,
    tipoProducto: sack.tipoProducto,
    contenedor: sack.containerReference ?? undefined,
    bl: sack.billOfLading ?? undefined,
    fecha: sack.fecha ?? undefined,
  };
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs text-[var(--color-muted)] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-[var(--color-foreground)] mt-0.5">
        {value ?? "—"}
      </dd>
    </div>
  );
}

/** Panel de detalle de la saca: datos + vista previa del QR + reimpresión. */
function SackPanel({ sack }: { sack: QrSackDetail }): React.JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Vista previa del QR + botón de imprimir */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <QrCodeIcon className="w-4 h-4 text-[var(--color-primary)]" />
            Etiqueta
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <QrCode value={sack.qrCode} size={160} />
          <QrPrintButton job={toPrintJob(sack)} />
        </CardContent>
      </Card>

      {/* Datos de la saca */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Datos de la saca</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field
              label="Código QR"
              value={<span className="font-mono">{sack.qrCode}</span>}
            />
            <Field label="Material" value={sack.materialName} />
            <Field
              label="Estado"
              value={<SackStatusBadge status={sack.status} />}
            />
            <Field label="Peso" value={formatKg(sack.weight)} />
            <Field label="Lote" value={sack.lotNumber} />
            <Field label="Nº saca" value={sack.batchNumber} />
            <Field label="Almacén" value={sack.warehouseName} />
            <Field label="Ubicación" value={sack.zoneName} />
            <Field label="Contenedor" value={sack.containerReference} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

/** Tabla de las últimas sacas creadas, con enlace «Ver» que rellena `?q=`. */
function RecentSacksTable({
  rows,
  activeQr,
}: {
  rows: Awaited<ReturnType<typeof listRecentSacks>>;
  activeQr: string | null;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sacas recientes</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            No hay sacas registradas todavía.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Código QR</TH>
                <TH>Material</TH>
                <TH>Estado</TH>
                <TH>Fecha</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR
                  key={row.id}
                  className={
                    row.qrCode === activeQr
                      ? "bg-[var(--color-surface-hover)]"
                      : undefined
                  }
                >
                  <TD className="font-mono text-xs">{row.qrCode}</TD>
                  <TD>{row.materialName}</TD>
                  <TD>
                    <SackStatusBadge status={row.status} />
                  </TD>
                  <TD className="whitespace-nowrap">
                    {row.createdAt.toLocaleDateString("es-ES")}
                  </TD>
                  <TD className="text-right">
                    <Link
                      href={`/qr?q=${encodeURIComponent(row.qrCode)}`}
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
