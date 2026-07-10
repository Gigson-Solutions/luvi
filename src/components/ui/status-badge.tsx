import {
  SackStatus,
  ShipmentStatus,
  IncidentStatus,
  PurchaseOrderStatus,
  QualityResult,
} from "@prisma/client";
import { Badge, type Tone } from "./badge";

// ─── Etiquetas legibles (naming validado con cliente) ──────────────────────────
const SACK_LABELS: Record<SackStatus, string> = {
  PENDIENTE_RECIBIR: "Pendiente recibir",
  EN_ALMACEN: "En almacén",
  EN_PRODUCCION: "En producción",
  PROCESADA: "Procesada",
  PRODUCTO_TERMINADO: "Producto terminado",
  SUBPRODUCTO: "Subproducto",
  RECHAZO: "Rechazo",
  EN_TRANSITO: "En tránsito",
  ENTREGADA: "Entregada",
  BAJA: "Baja",
};

const SACK_TONES: Record<SackStatus, Tone> = {
  PENDIENTE_RECIBIR: "amber",
  EN_ALMACEN: "blue",
  EN_PRODUCCION: "purple",
  PROCESADA: "sky",
  PRODUCTO_TERMINADO: "green",
  SUBPRODUCTO: "sky",
  RECHAZO: "red",
  EN_TRANSITO: "sky",
  ENTREGADA: "green",
  BAJA: "gray",
};

const SHIPMENT_LABELS: Record<ShipmentStatus, string> = {
  BORRADOR: "Borrador",
  CONFIRMADO: "Confirmado",
  EXPEDIDO: "Expedido",
  ENTREGADO: "Entregado",
};

const SHIPMENT_TONES: Record<ShipmentStatus, Tone> = {
  BORRADOR: "gray",
  CONFIRMADO: "amber",
  EXPEDIDO: "sky",
  ENTREGADO: "green",
};

const INCIDENT_LABELS: Record<IncidentStatus, string> = {
  ABIERTA: "Abierta",
  EN_REVISION: "En revisión",
  EN_PROCESO: "En proceso",
  RESUELTA: "Resuelta",
  CERRADA: "Cerrada",
};

const INCIDENT_TONES: Record<IncidentStatus, Tone> = {
  ABIERTA: "red",
  EN_REVISION: "amber",
  EN_PROCESO: "blue",
  RESUELTA: "green",
  CERRADA: "gray",
};

const PO_LABELS: Record<PurchaseOrderStatus, string> = {
  ABIERTA: "Abierta",
  EN_TRANSITO: "En tránsito",
  RECIBIDA_PARCIAL: "Recibida parcial",
  COMPLETADA: "Completada",
  CANCELADA: "Cancelada",
};

const PO_TONES: Record<PurchaseOrderStatus, Tone> = {
  ABIERTA: "amber",
  EN_TRANSITO: "sky",
  RECIBIDA_PARCIAL: "blue",
  COMPLETADA: "green",
  CANCELADA: "gray",
};

const QUALITY_LABELS: Record<QualityResult, string> = {
  OK: "OK",
  NOK: "NOK",
  PENDIENTE: "Pendiente",
};

const QUALITY_TONES: Record<QualityResult, Tone> = {
  OK: "green",
  NOK: "red",
  PENDIENTE: "amber",
};

export function SackStatusBadge({
  status,
}: {
  status: SackStatus;
}): React.JSX.Element {
  return <Badge tone={SACK_TONES[status]}>{SACK_LABELS[status]}</Badge>;
}

export function ShipmentStatusBadge({
  status,
}: {
  status: ShipmentStatus;
}): React.JSX.Element {
  return <Badge tone={SHIPMENT_TONES[status]}>{SHIPMENT_LABELS[status]}</Badge>;
}

export function IncidentStatusBadge({
  status,
}: {
  status: IncidentStatus;
}): React.JSX.Element {
  return <Badge tone={INCIDENT_TONES[status]}>{INCIDENT_LABELS[status]}</Badge>;
}

export function PurchaseOrderStatusBadge({
  status,
}: {
  status: PurchaseOrderStatus;
}): React.JSX.Element {
  return <Badge tone={PO_TONES[status]}>{PO_LABELS[status]}</Badge>;
}

export function QualityResultBadge({
  result,
}: {
  result: QualityResult;
}): React.JSX.Element {
  return <Badge tone={QUALITY_TONES[result]}>{QUALITY_LABELS[result]}</Badge>;
}

export {
  SACK_LABELS,
  SHIPMENT_LABELS,
  INCIDENT_LABELS,
  PO_LABELS,
  QUALITY_LABELS,
};
