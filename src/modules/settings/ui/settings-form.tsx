"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actualizarConfiguracionAction } from "@/modules/settings/actions";

export function SettingsForm({ earningAvailableDays }: { earningAvailableDays: number }) {
  const router = useRouter();
  const [days, setDays] = useState(earningAvailableDays.toString());
  const [isPending, startTransition] = useTransition();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(days);
    if (!Number.isInteger(value) || value < 0 || value > 365) {
      return toast.error("Ingresa un número entero entre 0 y 365.");
    }
    startTransition(async () => {
      try {
        await actualizarConfiguracionAction({ earningAvailableDays: value });
        toast.success("Configuración guardada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4 rounded-lg border border-border p-5">
      <div>
        <h2 className="text-lg font-semibold">Pagos a instructores</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Días que una venta aprobada queda en garantía antes de que su ganancia esté disponible
          para pagar al instructor (por ejemplo, por si el alumno pide un reembolso).
        </p>
      </div>
      <div className="flex flex-col gap-1.5 max-w-xs">
        <Label htmlFor="earningAvailableDays">Periodo de garantía (días)</Label>
        <Input
          id="earningAvailableDays"
          type="number"
          min={0}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="h-9"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Solo afecta a ventas aprobadas después de guardar. Las ganancias que ya existen conservan
        la fecha de disponibilidad con la que se calcularon.
      </p>
      <div>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
