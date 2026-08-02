"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revocarAcceso } from "@/modules/refunds/actions";

export function RevokeAccessButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);

  function revocar() {
    if (!motivo.trim()) return toast.error("Escribe el motivo del reembolso.");
    startTransition(async () => {
      try {
        await revocarAcceso(orderId, motivo);
        toast.success("Reembolso procesado.");
        setAbierto(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo procesar el reembolso.");
      }
    });
  }

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="destructive" onClick={() => setAbierto(true)}>
        Revocar acceso y reembolsar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Motivo del reembolso"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-8"
      />
      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={revocar}>
        Confirmar
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  );
}
