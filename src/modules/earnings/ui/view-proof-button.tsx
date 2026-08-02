"use client";
import { useState } from "react";
import { toast } from "sonner";

export function ViewProofButton({ payoutId, hasProof }: { payoutId: string; hasProof: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  if (!hasProof) return <span className="text-xs text-muted-foreground">Sin evidencia</span>;

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
        Abrir comprobante
      </a>
    );
  }

  async function verComprobante() {
    const res = await fetch(`/api/pagos/${payoutId}/comprobante-url`);
    const data = await res.json();
    if (res.ok) setUrl(data.url);
    else toast.error(data.error ?? "No se pudo abrir el comprobante.");
  }

  return (
    <button
      type="button"
      onClick={verComprobante}
      className="text-xs text-primary hover:underline"
    >
      Ver comprobante
    </button>
  );
}
