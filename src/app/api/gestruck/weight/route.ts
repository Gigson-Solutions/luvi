import { NextRequest, NextResponse } from "next/server";
import { readWeight } from "@/lib/integrations/gestruck";
import { getCurrentUser } from "@/lib/rbac";

/**
 * Proxy para leer el peso de las básculas Gestruck.
 * Delega en la integración, que siempre cae a { manual: true } si algo falla.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  // El proxy deja pasar /api/* sin sesión: se exige aquí.
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const vehicle = req.nextUrl.searchParams.get("vehicle") ?? undefined;
  const scaleId = req.nextUrl.searchParams.get("scaleId") ?? undefined;
  const reading = await readWeight({ vehicle, scaleId });
  return NextResponse.json(reading);
}
