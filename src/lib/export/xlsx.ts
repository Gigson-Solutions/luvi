import ExcelJS from "exceljs";

/**
 * Generación de Excel (.xlsx) para las exportaciones de los módulos.
 *
 * Cada módulo describe sus hojas (columnas + filas ya filtradas) y aquí se
 * convierten en un libro con cabecera en negrita, fila fija y autofiltro. Las
 * fechas se escriben como texto en hora de Madrid para que el Excel muestre lo
 * mismo que la app (el servidor corre en UTC).
 */

export type CellValue = string | number | Date | null | undefined;

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** Formato numérico de Excel, p. ej. "#,##0.00". */
  numFmt?: string;
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, CellValue>[];
}

export interface ExportFile {
  /** Nombre sin extensión; se le añade la fecha y `.xlsx`. */
  filename: string;
  sheets: SheetSpec[];
}

/** Formatos numéricos habituales. */
export const NUM = {
  kg: "#,##0.00",
  eur: '#,##0.00 "€"',
  tons: "#,##0.000",
  int: "0",
} as const;

const MADRID_DATE = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const MADRID_DATETIME = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Fecha (dd/mm/aaaa) en hora de Madrid, o null. */
export function xDate(d: Date | null | undefined): string | null {
  return d ? MADRID_DATE.format(d) : null;
}

/** Fecha y hora (dd/mm/aaaa, hh:mm) en hora de Madrid, o null. */
export function xDateTime(d: Date | null | undefined): string | null {
  return d ? MADRID_DATETIME.format(d) : null;
}

/** Excel no admite en el nombre de hoja : \ / ? * [ ] y lo limita a 31. */
function sheetName(name: string): string {
  return name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
}

export async function buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Luvi";
  wb.created = new Date();

  for (const spec of sheets) {
    const ws = wb.addWorksheet(sheetName(spec.name), {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = spec.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 2),
      style: c.numFmt ? { numFmt: c.numFmt } : {},
    }));
    for (const row of spec.rows) {
      ws.addRow(
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v ?? null])),
      );
    }
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE2E8F0" },
    };
    if (spec.columns.length > 0) {
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: spec.columns.length },
      };
    }
  }

  const data = await wb.xlsx.writeBuffer();
  return Buffer.from(data);
}

/** Respuesta HTTP de descarga del libro: `<nombre>_<aaaa-mm-dd>.xlsx`. */
export async function xlsxResponse(file: ExportFile): Promise<Response> {
  const buffer = await buildWorkbook(file.sheets);
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
  }).format(new Date());
  const name = `${file.filename}_${today}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
