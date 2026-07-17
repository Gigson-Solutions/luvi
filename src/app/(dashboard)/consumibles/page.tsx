import { Package, AlertTriangle, Boxes, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, StatCard } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import {
  listConsumables,
  listLowStockConsumables,
  getConsumableStats,
  getConsumableOptions,
  listBuyerPalletBalances,
  getPalletStats,
  getBuyerOptions,
  listPalletConsumables,
  listPalletMovements,
  CONSUMABLE_TYPE_LABELS,
} from "@/lib/services/consumable.service";
import {
  ConsumableMovementDialog,
  PalletMovementDialog,
  PalletReturnDialog,
} from "./consumable-dialogs";

export default async function ConsumiblesPage(): Promise<React.JSX.Element> {
  const [
    consumables,
    lowStock,
    stats,
    consumableOptions,
    palletBalances,
    palletStats,
    buyerOptions,
    palletConsumables,
    palletMovements,
  ] = await Promise.all([
    listConsumables(),
    listLowStockConsumables(),
    getConsumableStats(),
    getConsumableOptions(),
    listBuyerPalletBalances(),
    getPalletStats(),
    getBuyerOptions(),
    listPalletConsumables(),
    listPalletMovements(),
  ]);

  return (
    <div>
      <PageHeader
        title="Consumibles"
        description="Stock de palés, sacas vacías y capuchones. Palés retornables por comprador."
        actions={<ConsumableMovementDialog consumables={consumableOptions} />}
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Referencias" value={stats.totalReferences} />
        <StatCard label="Unidades en stock" value={stats.totalUnits} />
        <StatCard
          label="Bajo mínimo"
          value={stats.belowMinimum}
          accent={
            stats.belowMinimum > 0 ? "var(--color-status-rechazo)" : undefined
          }
          hint={
            stats.belowMinimum > 0 ? "Requieren reposición" : "Todo en niveles"
          }
        />
        <StatCard
          label="Palés prestados"
          value={palletStats.totalLoaned}
          hint={`${palletStats.buyersWithPallets} compradores`}
        />
      </section>

      {/* Alertas de mínimo */}
      {lowStock.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[var(--color-status-rechazo)]" />
            <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
              Alertas de mínimo
              <span className="ml-2 text-[var(--color-muted)] font-normal">
                {lowStock.length}
              </span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.map((c) => (
              <Card
                key={c.id}
                className="p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--color-foreground)]">
                    {c.name}
                  </p>
                  <p className="text-xs text-[var(--color-muted)] mt-0.5">
                    {c.currentStock} / mín. {c.minStock} {c.unit}
                  </p>
                </div>
                <Badge tone="red">Bajo mínimo</Badge>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Stock de consumibles */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--color-foreground)] mb-3">
          Stock de consumibles
        </h2>
        {consumables.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No hay consumibles registrados"
            description="Registra un movimiento de entrada para dar de alta stock."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Consumible</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Stock actual</TH>
                <TH className="text-right">Mínimo</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {consumables.map((c) => {
                const low = c.currentStock < c.minStock;
                return (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD>
                      <Badge tone="neutral">
                        {CONSUMABLE_TYPE_LABELS[c.type]}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {c.currentStock} {c.unit}
                    </TD>
                    <TD className="text-right tabular-nums text-[var(--color-muted)]">
                      {c.minStock} {c.unit}
                    </TD>
                    <TD>
                      {low ? (
                        <Badge tone="red">Bajo mínimo</Badge>
                      ) : (
                        <Badge tone="green">OK</Badge>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>

      {/* Palés retornables por comprador */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
            Palés retornables por comprador
          </h2>
          <div className="flex gap-2">
            <PalletMovementDialog buyers={buyerOptions} />
            <PalletReturnDialog
              buyers={buyerOptions}
              palletConsumables={palletConsumables}
            />
          </div>
        </div>
        {palletBalances.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title="No hay compradores activos"
            description="Los palés en fianza se controlan por comprador."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Comprador</TH>
                <TH>Código</TH>
                <TH className="text-right">Pendiente de devolver</TH>
                <TH>Estado</TH>
                <TH className="text-right">Acción</TH>
              </TR>
            </THead>
            <TBody>
              {palletBalances.map((b) => (
                <TR key={b.buyerId}>
                  <TD className="font-medium">{b.buyerName}</TD>
                  <TD className="text-[var(--color-muted)]">{b.buyerCode}</TD>
                  <TD className="text-right tabular-nums">{b.balance}</TD>
                  <TD>
                    {b.balance > 0 ? (
                      <Badge tone="amber">Con palés en fianza</Badge>
                    ) : b.balance < 0 ? (
                      <Badge tone="purple">Saldo a favor</Badge>
                    ) : (
                      <Badge tone="neutral">Al día</Badge>
                    )}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <PalletMovementDialog
                        buyers={buyerOptions}
                        defaultBuyerId={b.buyerId}
                      />
                      <PalletReturnDialog
                        buyers={buyerOptions}
                        palletConsumables={palletConsumables}
                        defaultBuyerId={b.buyerId}
                      />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </section>

      {/* Histórico de movimientos de palés (por cliente) */}
      <section className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-[var(--color-muted)]" />
          <h2 className="text-sm font-semibold text-[var(--color-foreground)]">
            Histórico de palés
            <span className="ml-2 text-[var(--color-muted)] font-normal">
              {palletMovements.length}
            </span>
          </h2>
        </div>
        {palletMovements.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin movimientos de palés"
            description="Aquí aparece el histórico de préstamos y devoluciones por cliente."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Cliente</TH>
                  <TH>Tipo</TH>
                  <TH className="text-right">Cantidad</TH>
                  <TH>Matrícula</TH>
                  <TH>Notas</TH>
                </TR>
              </THead>
              <TBody>
                {palletMovements.map((m) => {
                  const isLoan = m.quantity > 0;
                  const broken = !isLoan && m.condition === "NOK";
                  return (
                    <TR key={m.id}>
                      <TD>{formatDate(m.createdAt, true)}</TD>
                      <TD className="font-medium">{m.buyer.name}</TD>
                      <TD>
                        {isLoan ? (
                          <Badge tone="amber">Préstamo</Badge>
                        ) : broken ? (
                          <Badge tone="red">Devolución rota</Badge>
                        ) : (
                          <Badge tone="green">Devolución OK</Badge>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </TD>
                      <TD className="text-[var(--color-muted)]">
                        {m.vehiclePlate ?? "—"}
                      </TD>
                      <TD className="text-[var(--color-muted)]">
                        {m.notes ?? "—"}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
