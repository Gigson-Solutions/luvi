"use client";

import { QRCodeSVG } from "qrcode.react";

export function QrCode({
  value,
  size = 128,
}: {
  value: string;
  size?: number;
}): React.JSX.Element {
  return (
    <div className="inline-flex flex-col items-center gap-1.5 p-3 rounded-lg bg-white border border-[var(--color-border)]">
      <QRCodeSVG value={value} size={size} level="M" />
      <span className="text-xs font-mono text-[var(--color-muted)]">
        {value}
      </span>
    </div>
  );
}
