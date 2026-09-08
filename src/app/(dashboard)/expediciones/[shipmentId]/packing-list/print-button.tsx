"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Imprime el packing list. El diálogo de impresión del navegador permite
 * también guardarlo como PDF, que es como el cliente lo va a "descargar".
 */
export function PrintButton(): React.JSX.Element {
  return (
    <Button
      type="button"
      onClick={() => window.print()}
      className="print:hidden"
    >
      <Printer className="w-4 h-4" /> Imprimir / Descargar PDF
    </Button>
  );
}
