"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Buscador de la página Gestión QR: introduce el ID o el código QR (SACK-…) de
 * una saca y empuja el término a la URL como `?q=` para que la página server
 * recargue el detalle. La lógica de búsqueda vive en el servicio.
 */
export function QrSearch({
  initialQuery,
}: {
  initialQuery: string;
}): React.JSX.Element {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function go(code: string): void {
    const q = code.trim();
    if (!q) return;
    router.push(`/qr?q=${encodeURIComponent(q)}`);
  }

  return (
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
        placeholder="ID o código QR de la saca (SACK-…)"
        aria-label="Buscar saca por ID o código QR"
      />
      <Button type="submit">
        <Search className="w-4 h-4" /> Buscar
      </Button>
    </form>
  );
}
