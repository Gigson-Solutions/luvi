/**
 * Lectura directa de la base de datos de Gestruck (Gesnet2, MySQL) como fuente
 * de pesajes. Se usa como:
 *   - Fuente PRINCIPAL del camión (BASCULA) en recepciones: el nº de contenedor
 *     solo está en las observaciones de la pesada, que la API no filtra.
 *   - Fuente ÚNICA de la PLATAFORMA (sacas de salida): la API no expone la
 *     plataforma; sus pesadas viven en `pesadalinia` con IdDeviceSystem=2.
 *
 * Regla de oro: si la BD no está configurada o falla → devolvemos null y el
 * llamador cae a manual. Nunca bloquea la operativa.
 *
 * Config por entorno (solo en el .env del servidor):
 *   GESTRUCK_DB_HOST=10.8.0.2  GESTRUCK_DB_PORT=3306
 *   GESTRUCK_DB_USER=giropes   GESTRUCK_DB_PASS=giropes  GESTRUCK_DB_NAME=gesnet2
 */
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

let pool: Pool | null = null;

function getPool(): Pool | null {
  const host = process.env.GESTRUCK_DB_HOST;
  if (!host) return null;
  if (!pool) {
    pool = mysql.createPool({
      host,
      port: Number(process.env.GESTRUCK_DB_PORT ?? 3306),
      user: process.env.GESTRUCK_DB_USER,
      password: process.env.GESTRUCK_DB_PASS,
      database: process.env.GESTRUCK_DB_NAME ?? "gesnet2",
      connectionLimit: 3,
      connectTimeout: 4000,
      // Fechas como string ISO para no depender de la zona del proceso.
      dateStrings: true,
    });
  }
  return pool;
}

export interface DbWeight {
  weight?: number; // bruto (kg)
  tare?: number; // tara (kg)
  net?: number; // neto (kg)
  weighedAt?: string; // fecha del pesaje
  material?: string; // material de la línea (plataforma)
}

interface PlatformRow extends RowDataPacket {
  PesNet: number | null;
  DataEntrada: string | null;
  material: string | null;
}

interface TruckByReferenceRow extends RowDataPacket {
  PesEntrada: number | null;
  PesSortida: number | null;
  PesNet: number | null;
  DataEntrada: string | null;
  DataSortida: string | null;
}

/** Normaliza una referencia para comparar: mayúsculas, sin espacios ni guiones. */
export function normalizeReference(ref: string): string {
  return ref.toUpperCase().replace(/[\s\-./]/g, "");
}

/** Mismo normalizado que `normalizeReference`, en SQL sobre la columna dada. */
const sqlNormalized = (col: string): string =>
  `REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(${col}, '')), ' ', ''), '-', ''), '.', ''), '/', '')`;

/**
 * Pesada de camión (báscula puente, IdDeviceSystem=1) de una RECEPCIÓN por su
 * referencia. En Gestruck el vehículo es la matrícula del camión y el nº de
 * contenedor se apunta como texto libre en `pesada.Observacions`, así que se
 * busca en los dos sitios. Se miran los últimos días (el contenedor suele
 * pesarse antes de registrar la recepción) y se coge la pesada más reciente.
 * `inProgress` = solo tiene la 1ª pesada (falta la de salida → sin neto).
 */
export async function readTruckWeightByReferenceFromDb(
  reference: string,
): Promise<(DbWeight & { inProgress: boolean }) | null> {
  const p = getPool();
  const ref = normalizeReference(reference);
  if (!p || ref.length < 4) return null;
  const [rows] = await p.query<TruckByReferenceRow[]>(
    `SELECT l.PesEntrada, l.PesSortida, l.PesNet, l.DataEntrada, l.DataSortida
       FROM pesadalinia l
       JOIN pesada pe ON pe.IdPesada = l.IdPesadaFK
       LEFT JOIN vehicle v ON v.IdVehicle = pe.IdVehicleFK
      WHERE l.IdDeviceSystem1aPesadaFK = 1
        AND COALESCE(pe.IsDeleted, 0) = 0
        AND COALESCE(l.IsDeleted, 0) = 0
        AND pe.DataCreacio >= NOW() - INTERVAL 30 DAY
        AND (${sqlNormalized("pe.Observacions")} LIKE CONCAT('%', ?, '%')
             OR ${sqlNormalized("v.Matricula")} = ?)
      ORDER BY l.IdPesadaLinia DESC
      LIMIT 1`,
    [ref, ref],
  );
  const r = rows[0];
  if (!r || r.PesEntrada == null) return null;
  const a = Number(r.PesEntrada);
  const hasSecond =
    r.DataSortida != null && r.PesSortida != null && Number(r.PesSortida) !== 0;
  if (!hasSecond) {
    return {
      inProgress: true,
      weight: a,
      weighedAt: r.DataEntrada ?? undefined,
    };
  }
  const b = Number(r.PesSortida);
  return {
    inProgress: false,
    weight: Math.max(a, b),
    tare: Math.min(a, b),
    net: r.PesNet != null ? Number(r.PesNet) : Math.abs(a - b),
    weighedAt: r.DataSortida ?? undefined,
  };
}

/**
 * PLATAFORMA: última pesada de big bag en la plataforma (IdDeviceSystem=2).
 * El peso de la saca es el neto (`PesNet`).
 */
export async function readPlatformWeightFromDb(): Promise<DbWeight | null> {
  const p = getPool();
  if (!p) return null;
  const [rows] = await p.query<PlatformRow[]>(
    `SELECT l.PesNet, l.DataEntrada, m.Descripcio AS material
       FROM pesadalinia l
       LEFT JOIN material m ON m.IdMaterial = l.IdMaterialFK
      WHERE l.IdDeviceSystem1aPesadaFK = 2
      ORDER BY l.IdPesadaLinia DESC
      LIMIT 1`,
  );
  const r = rows[0];
  if (!r || r.PesNet == null) return null;
  const net = Number(r.PesNet);
  return {
    weight: net,
    net,
    weighedAt: r.DataEntrada ?? undefined,
    material: r.material ?? undefined,
  };
}
