"use client";
import { useState } from "react";
import { toast } from "sonner";

export function ViewPayoutQrButton({ instructorId }: { instructorId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
        Ver QR
      </a>
    );
  }

  async function verQr() {
    const res = await fetch(`/api/perfil/${instructorId}/payout-qr-url`);
    const data = await res.json();
    if (res.ok) setUrl(data.url);
    else toast.error(data.error ?? "No se pudo abrir el QR.");
  }

  return (
    <button type="button" onClick={verQr} className="text-xs text-primary hover:underline">
      Ver QR
    </button>
  );
}
