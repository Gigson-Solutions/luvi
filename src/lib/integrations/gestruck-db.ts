/**
 * Lectura directa de la base de datos de Gestruck (Gesnet2, MySQL) como fuente
 * de pesajes. Se usa como:
 *   - FALLBACK del camión (BASCULA) cuando la API REST no responde.
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

interface TruckRow extends RowDataPacket {
  PesEntrada: number | null;
  PesSortida: number | null;
  PesNet: number | null;
  DataSortida: string | null;
}

interface PlatformRow extends RowDataPacket {
  PesNet: number | null;
  DataEntrada: string | null;
  material: string | null;
}

/**
 * FALLBACK camión: última pesada completada (2 pesadas) de una matrícula en la
 * báscula puente (IdDeviceSystem=1). bruto=mayor, tara=menor, neto=PesNet.
 */
export async function readTruckWeightFromDb(
  matricula: string,
): Promise<DbWeight | null> {
  const p = getPool();
  if (!p || !matricula) return null;
  const [rows] = await p.query<TruckRow[]>(
    `SELECT l.PesEntrada, l.PesSortida, l.PesNet, l.DataSortida
       FROM pesadalinia l
       JOIN pesada pe ON pe.IdPesada = l.IdPesadaFK
       JOIN vehicle v ON v.IdVehicle = pe.IdVehicleFK
      WHERE v.Matricula = ?
        AND l.IdDeviceSystem1aPesadaFK = 1
        AND l.PesSortida IS NOT NULL AND l.PesSortida <> 0
      ORDER BY l.IdPesadaLinia DESC
      LIMIT 1`,
    [matricula],
  );
  const r = rows[0];
  if (!r || r.PesEntrada == null || r.PesSortida == null) return null;
  const a = Number(r.PesEntrada);
  const b = Number(r.PesSortida);
  return {
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
