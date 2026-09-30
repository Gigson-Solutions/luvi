import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/rbac";
import { canAccess, type Module } from "@/lib/permissions";
import { EXPORTS } from "@/lib/export/modules";
import { xlsxResponse } from "@/lib/export/xlsx";

/**
 * Descarga en Excel de un módulo con los filtros de su página:
 * `/api/export/almacen?status=EN_ALMACEN&material=…`. Exige sesión y acceso
 * al módulo (el proxy deja pasar /api/* sin comprobar rol).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ modulo: string }> },
): Promise<Response> {
  const { modulo } = await params;
  const build = Object.hasOwn(EXPORTS, modulo)
    ? EXPORTS[modulo as Module]
    : undefined;
  if (!build) {
    return NextResponse.json(
      { error: "Módulo no exportable" },
      { status: 404 },
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!canAccess(user.role, modulo as Module)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return xlsxResponse(await build(req.nextUrl.searchParams));
}
