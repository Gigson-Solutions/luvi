import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveImage } from "@/lib/storage";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "luvi-uploads-"));
  process.env.UPLOADS_DIR = dir;
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("storage — saveImage", () => {
  it("guarda una imagen y devuelve su ruta servida", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "foto.jpg", {
      type: "image/jpeg",
    });
    const url = await saveImage(file, "incidencias");
    expect(url).toMatch(/^\/api\/uploads\/incidencias\/[\w-]+\.jpg$/);
    const files = await readdir(path.join(dir, "incidencias"));
    expect(files.length).toBeGreaterThanOrEqual(1);
  });

  it("rechaza archivos que no son imágenes", async () => {
    const file = new File(["texto"], "a.txt", { type: "text/plain" });
    await expect(saveImage(file, "incidencias")).rejects.toThrow(/imagen/);
  });

  it("rechaza imágenes por encima del tamaño máximo", async () => {
    const big = new File([new Uint8Array(9 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    await expect(saveImage(big, "incidencias")).rejects.toThrow(/tamaño/);
  });
});
