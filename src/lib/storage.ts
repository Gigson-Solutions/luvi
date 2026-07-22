import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Almacenamiento de archivos subidos (fotos de incidencias, etc.).
 *
 * Deploy self-hosted en Hetzner → guardamos en el disco local del VPS, NO en
 * un CDN/object storage externo (evitamos dependencias tipo R2/Cloudflare por
 * los bloqueos de LaLiga en ES). El directorio se configura con `UPLOADS_DIR`
 * y vive FUERA del repo para persistir entre despliegues (`git reset --hard`).
 *
 * La abstracción es extensible: si algún día se quiere object storage, se
 * cambia solo esta capa sin tocar el resto de la app.
 */

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/** Directorio raíz de subidas (persistente, fuera del repo). */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
}

/**
 * Guarda una imagen en `${UPLOADS_DIR}/${subdir}/` con nombre aleatorio y
 * devuelve la ruta pública servida por la app (`/api/uploads/...`), lista para
 * usar como `src` de una imagen o guardar en base de datos.
 */
export async function saveImage(file: File, subdir: string): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("La imagen supera el tamaño máximo (8 MB)");
  }

  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const filename = `${randomUUID()}.${ext}`;
  const dir = path.join(uploadsDir(), subdir);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, filename),
    Buffer.from(await file.arrayBuffer()),
  );

  return `/api/uploads/${subdir}/${filename}`;
}
