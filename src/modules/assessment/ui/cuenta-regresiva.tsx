"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function formatear(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${String(min).padStart(2, "0")}:${String(seg).padStart(2, "0")}`;
}

/**
 * Cronómetro puramente cosmético: la autoridad sobre el tiempo es el servidor.
 * Al llegar a cero recarga la página, que ya auto-envía el intento vencido.
 */
export function CuentaRegresiva({ expiresAtISO }: { expiresAtISO: string }) {
  const expiresAt = new Date(expiresAtISO).getTime();
  const [restante, setRestante] = useState(() => expiresAt - Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const ms = expiresAt - Date.now();
      setRestante(ms);
      if (ms <= 0) {
        clearInterval(id);
        window.location.reload();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const urgente = restante <= 60_000;

  return (
    <span
      role="timer"
      aria-live="off"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-sm font-medium ${
        urgente
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <Clock className="size-3.5" />
      {formatear(restante)}
    </span>
  );
}
