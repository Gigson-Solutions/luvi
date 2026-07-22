import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/rbac";
import { uploadsDir } from "@/lib/storage";

/**
 * Sirve archivos subidos desde el disco del VPS (`UPLOADS_DIR`).
 * Solo para usuarios autenticados; blindado contra path-traversal.
 */

const TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const { path: segments } = await params;
  // Rechaza segmentos con separadores o "…" para evitar salir del directorio.
  if (
    segments.some(
      (s) => s.includes("..") || s.includes("/") || s.includes("\\"),
    )
  ) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  const root = path.resolve(uploadsDir());
  const full = path.join(root, ...segments);
  if (full !== root && !full.startsWith(root + path.sep)) {
    return new NextResponse("No encontrado", { status: 404 });
  }

  try {
    const data = await readFile(full);
    const ext = full.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPE_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("No encontrado", { status: 404 });
  }
}
