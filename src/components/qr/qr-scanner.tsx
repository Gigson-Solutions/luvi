"use client";

import { useState } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Camera, Keyboard } from "lucide-react";

/**
 * Escáner QR con cámara + fallback a entrada manual (para desktop sin cámara).
 * Llama a onScan con el código detectado o introducido.
 */
export function QrScanner({
  onScan,
}: {
  onScan: (code: string) => void;
}): React.JSX.Element {
  const [mode, setMode] = useState<"camera" | "manual">("manual");
  const [manual, setManual] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "camera" ? "primary" : "outline"}
          onClick={() => setMode("camera")}
        >
          <Camera className="w-4 h-4" /> Cámara
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "manual" ? "primary" : "outline"}
          onClick={() => setMode("manual")}
        >
          <Keyboard className="w-4 h-4" /> Manual
        </Button>
      </div>

      {mode === "camera" ? (
        <div className="max-w-xs rounded-lg overflow-hidden border border-[var(--color-border)]">
          <Scanner
            onScan={(codes) => {
              const val = codes[0]?.rawValue;
              if (val) onScan(val);
            }}
            components={{ finder: false }}
          />
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onScan(manual.trim());
          }}
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Código QR de la saca (SACK-…)"
          />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
      )}
    </div>
  );
}
