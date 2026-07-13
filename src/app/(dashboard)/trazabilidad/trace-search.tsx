"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/qr/qr-scanner";

/**
 * Buscador de trazabilidad: escáner QR (cámara/manual) o input de texto.
 * Empuja el término a la URL como `?q=` para que la página server recargue
 * la cadena. La lógica de recorrido vive íntegra en el servicio.
 */
export function TraceSearch({
  initialQuery,
}: {
  initialQuery: string;
}): React.JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function go(code: string): void {
    const q = code.trim();
    if (!q) return;
    router.push(`/trazabilidad?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go(value);
        }}
      >
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="QR o ID de saca (SACK-…)"
          aria-label="Buscar saca por QR o ID"
        />
        <Button type="submit">
          <Search className="w-4 h-4" /> Buscar
        </Button>
      </form>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-xs font-medium text-[var(--color-muted)] uppercase tracking-wide mb-3">
          Escanear QR
        </p>
        <QrScanner onScan={go} />
      </div>
    </div>
  );
}
