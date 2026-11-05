import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readWeight } from "@/lib/integrations/gestruck";
import { createAlbaran } from "@/lib/integrations/holded";
import { buildZpl, enqueueLabels } from "@/lib/integrations/qr-printer";

describe("Gestruck readWeight (fallback)", () => {
  const prev = {
    url: process.env.GESTRUCK_API_URL,
    key: process.env.GESTRUCK_API_KEY,
  };
  beforeEach(() => {
    delete process.env.GESTRUCK_API_URL;
    delete process.env.GESTRUCK_API_KEY;
  });
  afterEach(() => {
    if (prev.url) process.env.GESTRUCK_API_URL = prev.url;
    if (prev.key) process.env.GESTRUCK_API_KEY = prev.key;
  });
  it("sin configuración devuelve manual=true", async () => {
    const r = await readWeight({ vehicle: "1234-ABC" });
    expect(r.manual).toBe(true);
    expect(r.weight).toBeUndefined();
  });
});

describe("Holded createAlbaran (fallback simulado)", () => {
  const prev = process.env.HOLDED_API_KEY;
  beforeEach(() => {
    delete process.env.HOLDED_API_KEY;
  });
  afterEach(() => {
    if (prev) process.env.HOLDED_API_KEY = prev;
  });
  it("sin API key simula el albarán", async () => {
    const r = await createAlbaran({
      buyerName: "Comprador X",
      reference: "EXP-260708-001",
      lines: [{ name: "080726-1", units: 995 }],
    });
    expect(r.ok).toBe(true);
    expect(r.simulated).toBe(true);
    expect(r.holdedId).toContain("EXP-260708-001");
  });
});

describe("Holded createAlbaran (errores de la API)", () => {
  const prevKey = process.env.HOLDED_API_KEY;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.HOLDED_API_KEY = "pat_test";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (prevKey) process.env.HOLDED_API_KEY = prevKey;
    else delete process.env.HOLDED_API_KEY;
  });

  it("un 400 del albarán incluye el motivo que devuelve Holded", async () => {
    globalThis.fetch = (async () =>
      new Response('{"error":"items[0].price is required"}', {
        status: 400,
      })) as typeof fetch;
    const r = await createAlbaran({
      contactHoldedId: "c1",
      buyerName: "Comprador X",
      reference: "EXP-1",
      lines: [{ name: "050126-1", units: 24640 }],
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("waybill 400");
    expect(r.error).toContain("items[0].price is required");
  });

  it("un 400 sin cuerpo sigue dando el estado", async () => {
    globalThis.fetch = (async () =>
      new Response("", { status: 400 })) as typeof fetch;
    const r = await createAlbaran({
      contactHoldedId: "c1",
      buyerName: "Comprador X",
      reference: "EXP-1",
      lines: [{ name: "050126-1", units: 1 }],
    });
    expect(r.error).toBe("Holded waybill 400");
  });
});

describe("Impresora ZPL", () => {
  it("buildZpl genera etiqueta con QR", () => {
    const zpl = buildZpl({
      qrCode: "SACK-ABC123",
      nombreProducto: "Pellet PE",
      loteOSaca: "270726-1",
      pesoNetoKg: 5000,
    });
    expect(zpl).toContain("^XA");
    expect(zpl).toContain("^XZ");
    expect(zpl).toContain("SACK-ABC123");
    expect(zpl).toContain("PESO NETO");
    expect(zpl).not.toContain("NOTAS");
  });
  it("buildZpl añade las notas del alta solo si las hay", () => {
    const zpl = buildZpl({
      qrCode: "SACK-ABC123",
      pesoNetoKg: 1000,
      notas: "Stock inicial ^ BL MEDU1234",
    });
    expect(zpl).toContain("NOTAS: Stock inicial BL MEDU1234");
  });
  it("enqueueLabels sin impresora simula la cola", async () => {
    const prev = process.env.QR_PRINTER_URL;
    delete process.env.QR_PRINTER_URL;
    const r = await enqueueLabels([{ qrCode: "SACK-1" }]);
    expect(r.simulated).toBe(true);
    expect(r.queued).toBe(1);
    if (prev) process.env.QR_PRINTER_URL = prev;
  });
});
