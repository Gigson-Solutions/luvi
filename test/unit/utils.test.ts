import { describe, it, expect } from "vitest";
import { formatKg, formatDate, generateLotNumber } from "@/lib/utils";

describe("formatKg", () => {
  it("muestra kg por debajo de 1000", () => {
    expect(formatKg(999)).toBe("999.0 kg");
    expect(formatKg(0)).toBe("0.0 kg");
  });
  it("convierte a TM a partir de 1000", () => {
    expect(formatKg(1000)).toBe("1.00 TM");
    expect(formatKg(23880)).toBe("23.88 TM");
  });
});

describe("generateLotNumber", () => {
  it("formatea DDMMYY-nºcontenedor", () => {
    expect(generateLotNumber(new Date(2026, 6, 8), 3)).toBe("080726-3");
    expect(generateLotNumber(new Date(2026, 0, 1), 12)).toBe("010126-12");
  });
});

describe("formatDate", () => {
  it("devuelve fecha es-ES", () => {
    const s = formatDate(new Date(2026, 6, 8));
    expect(s).toContain("2026");
    expect(s).toContain("08");
  });
  it("incluye hora cuando se pide", () => {
    const s = formatDate(new Date(2026, 6, 8, 14, 30), true);
    expect(s).toMatch(/14[:.]30|14:30/);
  });
});
