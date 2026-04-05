import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy para leer el peso de las básculas Gestruck.
 * API pendiente de validar con José (informático Melder).
 *
 * Fallback: si Gestruck no responde, devuelve { manual: true }
 * para que el frontend muestre el campo de entrada manual.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const scaleId = req.nextUrl.searchParams.get("scaleId") ?? "1";

  const gestruck_url = process.env.GESTRUCK_API_URL;
  const gestruck_key = process.env.GESTRUCK_API_KEY;

  if (!gestruck_url || !gestruck_key) {
    return NextResponse.json(
      { manual: true, reason: "Gestruck no configurado" },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(`${gestruck_url}/scale/${scaleId}/weight`, {
      headers: { Authorization: `Bearer ${gestruck_key}` },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) throw new Error(`Gestruck error: ${res.status}`);

    const data = (await res.json()) as { weight?: number };
    return NextResponse.json({ weight: data.weight, manual: false, scaleId });
  } catch {
    return NextResponse.json(
      { manual: true, reason: "Báscula no disponible" },
      { status: 200 }
    );
  }
}
