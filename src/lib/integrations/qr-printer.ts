/**
 * Cola de impresión de etiquetas de saca (Zebra / ZPL).
 *
 * Reproduce la plantilla oficial "Etiqueta_Saca_A5_148x210mm": un recuadro con
 * cabecera partida en dos (QR ~25% a la izquierda · logo + código/tipo/nombre a
 * la derecha) y, debajo, la lista de campos con viñetas. Generamos el ZPL de
 * forma data-driven (no imprimimos el .docx) y lo dejamos listo para la cola.
 *
 * La abstracción es extensible a otras marcas: solo cambiaría `buildZpl` /
 * `enqueueLabels`.
 *
 * OJO tamaño: la plantilla es A5 (148×210 mm). A 203 dpi (8 dots/mm) el ancho
 * son 1184 dots. Ajustable por `DPMM` si la Zebra final es de 300 dpi (12 dpmm)
 * o si el ancho de banda de etiqueta es otro (pendiente confirmar modelo/rollo).
 */

export interface LabelData {
  qrCode: string; // contenido del QR (normalmente el código de saca SACK-…)
  codigoProducto?: string; // código del material/producto
  tipoProducto?: string; // MP / PT / Subproducto / Rechazo
  nombreProducto?: string; // nombre del material
  loteOSaca?: string; // "LOTE / NÚMERO DE SACA"
  contenedor?: string;
  bl?: string; // Bill of Lading
  proyecto?: string;
  fecha?: string; // recepción o producción (dd/mm/aaaa)
  pesoNetoKg?: number;
}

/** Densidad de la impresora en dots/mm. 8 = 203 dpi, 12 = 300 dpi. */
const DPMM = 8;
const mm = (v: number): number => Math.round(v * DPMM);

const LABEL_W = mm(148); // A5 ancho
const MARGIN = mm(8);
const BOX_X = MARGIN;
const BOX_W = LABEL_W - 2 * MARGIN;
const HEADER_H = mm(46); // fila de cabecera (QR | logo+códigos)

/** Logo Luvi2000 en ZPL (^GFA 1-bit, 200x60), incrustado en la cabecera. */
const LUVI_LOGO_GFA =
  "^GFA,1500,1500,25,0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001E0000000000000000000000000000000000000000000000001E0000000000000000000000000000000000000000000000001E0000000000000000000000000000000000000000000000001E00000000000001F0000000000000000000000000000000003E00000000000003F0000000000000000000000000000000003E00000000000003F0000000000000000000000000000000003C00000000000003E000000000000000000000000003F000003C00000000000001E000000000000000000000000003FF00003C000000000000000007E0000F80007C0003F0000003FFC0007C00000000000000003FF8007FE003FF800FFC000003FFE0007C00000000000000007FFC00FFF007FFC03FFE000001FFF8007800000000000000007FFE01FFF80FFFC07FFE000000FFF800780F801E1F001F07C0F03E03E0781F03E0781F0000003FFC00780F801E1F001F07C0401E07C07C1E01E0F00F8000000FFC00F80F001E0F003E0780001E07803C3C01E1F00F80000001F800F80F003E0F003E0780001E0F003C3C01E1E00F800000000000F80F003E0F003C0F80003E0F003C7801E1E00F800000000000F01F003C0F807C0F80003E0F003C7801E3C00F800000000000F01F003C0F807C0F80003C1E003C7801E3C00F800000000001F01E003C0F80780F00007C1E003CF001E3C00F800000000001F01E007C0780F80F0000F81E0078F001E7800F800000000001F01E007C0780F01F0000F03E0078F001E7800F000000000001E03E00780781F01F0001F03C0078F003C7800F000000000001E03E007807C1E01F0003E03C0079E003C7800F000000000003E03C00F807C3E01E0007C03C0079E003C7801E000000000003E03C00F807C3C01E000F803C00F1E003CF801E000000000003E03C01F807C7C03E003F003C00F1E0078F001E000000000003C07C01F003CF803E007C003C00F1E0078F003C000000000003C07C03F003CF803E00F8003C01E1E00F8F003C000000000007C07C07F003DF003C01F0003C01E1E00F0F807C000000000007C07C0FF003FE003C03E0003C03C1F01F078078000000000007C07E1FF003FE007C07C0003E07C0F03E0780F0000000000007803FFFE003FC007C0FFFF81F9F80FCFC07E7F000000000000F803FFDE001F8007C0FFFF81FFF007FF803FFE000000000000F801FF1E001F000780FFFF00FFE003FF001FF80000000000000000FC0000000000000000003F8001FC0007E00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

/** Escapa caracteres de control de ZPL en datos de campo. */
function zpl(value: string | number | undefined, fallback = ""): string {
  const s = value == null || value === "" ? fallback : String(value);
  return s.replace(/[\^~]/g, " ");
}

/** Genera el ZPL de una etiqueta de saca (plantilla A5). */
export function buildZpl(label: LabelData): string {
  const lines: string[] = ["^XA", "^CI28", `^PW${LABEL_W}`, "^LH0,0"];

  const box = (x: number, y: number, w: number, h: number): string =>
    `^FO${x},${y}^GB${w},${h},3^FS`;
  const text = (x: number, y: number, size: number, s: string): string =>
    `^FO${x},${y}^CF0,${size}^FD${s}^FS`;

  const top = MARGIN;
  const colSplit = BOX_X + Math.round(BOX_W / 2); // cabecera 50/50 como el docx

  // --- Cabecera izquierda: QR (~25%) centrado ---
  const qrBox = mm(37);
  const qrMag = 11; // ~ ocupa el 25% del ancho
  const qrX = BOX_X + Math.round((colSplit - BOX_X - qrBox) / 2);
  const qrY = top + Math.round((HEADER_H - qrBox) / 2);
  lines.push(`^FO${qrX},${qrY}^BQN,2,${qrMag}^FDMA,${zpl(label.qrCode)}^FS`);

  // --- Cabecera derecha: logo + código / tipo / nombre ---
  const rx = colSplit + mm(4);
  let hy = top + mm(3);
  lines.push(`^FO${rx},${hy}${LUVI_LOGO_GFA}^FS`); // logo Luvi2000 (200x60)
  hy += mm(12);
  lines.push(text(rx, hy, 26, `CÓDIGO PRODUCTO: ${zpl(label.codigoProducto)}`));
  hy += mm(8);
  lines.push(text(rx, hy, 26, `TIPO DE PRODUCTO: ${zpl(label.tipoProducto)}`));
  hy += mm(8);
  lines.push(text(rx, hy, 26, "NOMBRE DEL PRODUCTO:"));

  // --- Cuerpo: lista con viñetas (ETIQUETA: valor) ---
  const bodyTop = top + HEADER_H;
  const rowH = mm(11);
  const bulletFields: Array<[string, string]> = [
    ["NOMBRE DEL PRODUCTO", zpl(label.nombreProducto)],
    ["LOTE / NÚMERO DE SACA", zpl(label.loteOSaca)],
    ["CONTENEDOR", zpl(label.contenedor)],
    ["BL", zpl(label.bl)],
    ["PROYECTO", zpl(label.proyecto)],
    ["FECHA RECEPCIÓN/PRODUCCIÓN", zpl(label.fecha)],
    ["PESO NETO", `${zpl(label.pesoNetoKg)} kg`],
  ];
  let by = bodyTop + mm(6);
  for (const [k, v] of bulletFields) {
    // viñeta (cuadradito relleno)
    lines.push(`^FO${BOX_X + mm(4)},${by + 6}^GB10,10,10^FS`);
    lines.push(text(BOX_X + mm(9), by, 30, `${k}: ${v}`));
    by += rowH;
  }

  // --- Bordes del recuadro (encima ya del contenido) ---
  const boxH = bodyTop + mm(6) + bulletFields.length * rowH + mm(4) - top;
  lines.push(box(BOX_X, top, BOX_W, boxH)); // recuadro exterior
  lines.push(box(BOX_X, top, BOX_W, HEADER_H)); // fila de cabecera
  lines.push(`^FO${colSplit},${top}^GB3,${HEADER_H},3^FS`); // separador vertical cabecera

  lines.push(`^LL${top + boxH + mm(8)}`);
  lines.push("^XZ");
  return lines.join("\n");
}

const PRINT_TIMEOUT_MS = 15000;

/* -------------------------------------------------------------------------
 * IPP / IPPS  —  transporte principal contra la Zebra ZT421 de planta.
 *
 * La ZT421 tiene el perfil de seguridad restrictivo del firmware Link-OS: NO
 * escucha en el 9100 (raw), ni 515 (LPD), ni 80 (web). Solo expone IPP sobre
 * TLS en el 631. Verificado en planta el 31-ago-2026: Print-Job → `job-state-
 * reasons: job-completed-successfully`.
 *
 * El certificado es autofirmado y, al ir por el túnel, el host que marcamos no
 * coincide con el del certificado → `rejectUnauthorized: false` a propósito.
 * Es una impresora en LAN privada al otro lado de una VPN, no un servicio
 * público: no hay nada que validar contra una CA.
 * ------------------------------------------------------------------------- */

/** Serializa un atributo IPP: tag + nombre + valor, longitudes big-endian. */
function ippAttr(tag: number, name: string, value: string): Buffer {
  const n = Buffer.from(name, "ascii");
  const v = Buffer.from(value, "utf8");
  const buf = Buffer.alloc(1 + 2 + n.length + 2 + v.length);
  let o = 0;
  buf.writeUInt8(tag, o);
  o += 1;
  buf.writeUInt16BE(n.length, o);
  o += 2;
  n.copy(buf, o);
  o += n.length;
  buf.writeUInt16BE(v.length, o);
  o += 2;
  v.copy(buf, o);
  return buf;
}

/** Petición IPP `Print-Job` (0x0002) con el ZPL como cuerpo del documento. */
function buildIppPrintJob(printerUri: string, zpl: string): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt8(0x01, 0); // versión IPP 1.1
  header.writeUInt8(0x01, 1);
  header.writeUInt16BE(0x0002, 2); // operation-id: Print-Job
  header.writeUInt32BE(1, 4); // request-id
  return Buffer.concat([
    header,
    Buffer.from([0x01]), // operation-attributes-tag
    ippAttr(0x47, "attributes-charset", "utf-8"),
    ippAttr(0x48, "attributes-natural-language", "en"),
    ippAttr(0x45, "printer-uri", printerUri),
    ippAttr(0x42, "requesting-user-name", "luvi"),
    // La ZT421 declara soportar octet-stream y vnd.zebra; usamos el probado.
    ippAttr(0x49, "document-format", "application/octet-stream"),
    Buffer.from([0x03]), // end-of-attributes-tag
    Buffer.from(zpl, "utf8"),
  ]);
}

/**
 * Envía ZPL por IPP/IPPS. `url` es el endpoint al que conectamos (puede ser el
 * `portproxy` del túnel); `printerUri` es la URI que la impresora se anuncia a
 * sí misma, que no tiene por qué coincidir con el host de conexión.
 * Nunca lanza: devuelve si el trabajo se aceptó.
 */
async function sendIpp(
  url: string,
  printerUri: string,
  zpl: string,
): Promise<boolean> {
  const target = new URL(url);
  const body = buildIppPrintJob(printerUri, zpl);
  const isTls = target.protocol === "https:";
  const { request } = isTls
    ? await import("node:https")
    : await import("node:http");

  return new Promise<boolean>((resolve) => {
    const req = request(
      {
        hostname: target.hostname,
        port: target.port || (isTls ? 443 : 80),
        path: target.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/ipp",
          "Content-Length": body.length,
        },
        timeout: PRINT_TIMEOUT_MS,
        ...(isTls ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const out = Buffer.concat(chunks);
          // status-code IPP en los bytes 2-3; < 0x0100 = éxito.
          const ok =
            res.statusCode === 200 &&
            out.length >= 4 &&
            out.readUInt16BE(2) < 0x0100;
          resolve(ok);
        });
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end(body);
  });
}

/**
 * Envía ZPL crudo por socket TCP (puerto 9100, "raw"/JetDirect). Es como habla
 * una Zebra de red: NO entiende HTTP. Nunca lanza; devuelve si pudo o no.
 */
async function sendRawZpl(
  host: string,
  port: number,
  payload: string,
): Promise<boolean> {
  const { connect } = await import("node:net");
  return new Promise<boolean>((resolve) => {
    const socket = connect({ host, port });
    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(PRINT_TIMEOUT_MS);
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.on("connect", () => {
      // ^CI28 en la etiqueta ⇒ la Zebra espera UTF-8.
      socket.end(payload, "utf8", () => finish(true));
    });
  });
}

/**
 * Envía etiquetas a la impresora. Dos transportes, por orden de preferencia:
 *
 *   1. `QR_PRINTER_IPP_URL` → IPP/IPPS. Es el que usa la Zebra ZT421 de planta,
 *      que solo admite IPP sobre TLS en el 631. Opcionalmente
 *      `QR_PRINTER_IPP_URI` fuerza el `printer-uri` anunciado, para cuando
 *      conectamos por el túnel y el host no coincide con el de la impresora.
 *      Ej.: URL `https://10.8.0.2:631/ipp/print`
 *           URI `ipps://192.168.1.212:631/ipp/print`
 *   2. `QR_PRINTER_HOST` (+ `QR_PRINTER_PORT`, 9100) → ZPL crudo por TCP, para
 *      una Zebra con el puerto raw abierto.
 *
 * Sin nada configurado, el QR se genera igual pero no se imprime.
 *
 * Regla de oro: imprimir nunca bloquea la operativa. Si falla, se informa
 * (`error`) pero no se lanza.
 */
export async function enqueueLabels(labels: LabelData[]): Promise<{
  queued: number;
  simulated: boolean;
  error?: string;
}> {
  const payload = labels.map(buildZpl).join("\n");
  const ippUrl = process.env.QR_PRINTER_IPP_URL;
  const host = process.env.QR_PRINTER_HOST;

  if (ippUrl) {
    const printerUri =
      process.env.QR_PRINTER_IPP_URI ?? ippUrl.replace(/^https:/, "ipps:");
    const ok = await sendIpp(ippUrl, printerUri, payload);
    return {
      queued: labels.length,
      simulated: false,
      error: ok ? undefined : "La impresora rechazó el trabajo o no responde",
    };
  }

  if (host) {
    const port = Number(process.env.QR_PRINTER_PORT ?? 9100);
    const ok = await sendRawZpl(host, port, payload);
    return {
      queued: labels.length,
      simulated: false,
      error: ok ? undefined : `Sin respuesta de la impresora (${host}:${port})`,
    };
  }

  // Sin impresora configurada: el QR se genera igual, solo no se imprime físicamente.
  return { queued: labels.length, simulated: true };
}
