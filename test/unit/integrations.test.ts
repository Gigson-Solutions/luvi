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

describe("Impresora ZPL", () => {
  it("buildZpl genera etiqueta con QR", () => {
    const zpl = buildZpl({
      qrCode: "SACK-ABC123",
      title: "MSKU-1",
      subtitle: "Pellet PE",
    });
    expect(zpl).toContain("^XA");
    expect(zpl).toContain("^XZ");
    expect(zpl).toContain("SACK-ABC123");
  });
  it("enqueueLabels sin impresora simula la cola", async () => {
    const prev = process.env.QR_PRINTER_URL;
    delete process.env.QR_PRINTER_URL;
    const r = await enqueueLabels([{ qrCode: "SACK-1", title: "T" }]);
    expect(r.simulated).toBe(true);
    expect(r.queued).toBe(1);
    if (prev) process.env.QR_PRINTER_URL = prev;
  });
});
