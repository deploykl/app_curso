"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revocarCertificado } from "@/modules/certification/actions";

export function RevokeCertificateButton({ certificateId }: { certificateId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [abierto, setAbierto] = useState(false);

  function revocar() {
    if (!motivo.trim()) return toast.error("Escribe el motivo de la revocación.");
    startTransition(async () => {
      try {
        await revocarCertificado(certificateId, motivo);
        toast.success("Certificado revocado.");
        setAbierto(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo revocar.");
      }
    });
  }

  if (!abierto) {
    return (
      <Button type="button" size="sm" variant="destructive" onClick={() => setAbierto(true)}>
        Revocar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="Motivo de la revocación"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        className="h-8"
      />
      <Button type="button" size="sm" variant="destructive" disabled={isPending} onClick={revocar}>
        Confirmar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAbierto(false)}>
        Cancelar
      </Button>
    </div>
  );
}
