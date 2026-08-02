"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { crearPagoInstructorAction } from "@/modules/earnings/actions";
import { formatPEN } from "@/lib/money";

export function PayoutButton({
  instructorId,
  disponibleCents,
}: {
  instructorId: string;
  disponibleCents: number;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [isPending, startTransition] = useTransition();

  if (disponibleCents <= 0) {
    return <span className="text-xs text-muted-foreground">Nada por pagar</span>;
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Pagar {formatPEN(disponibleCents)}
      </Button>
    );
  }

  function confirmar() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return toast.error("Adjunta la captura del pago como evidencia.");

    startTransition(async () => {
      try {
        const presignRes = await fetch("/api/r2/payout-proof-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instructorId, fileName: file.name, mimeType: file.type, sizeBytes: file.size,
          }),
        });
        const presign = await presignRes.json();
        if (!presignRes.ok) throw new Error(presign.error ?? "No se pudo preparar la subida.");

        const putRes = await fetch(presign.url, {
          method: "PUT", headers: { "Content-Type": file.type }, body: file,
        });
        if (!putRes.ok) throw new Error("Falló la subida de la evidencia.");

        const { totalCents } = await crearPagoInstructorAction(instructorId, {
          reference: reference || undefined,
          proofFileKey: presign.key,
        });
        toast.success(`Pago de ${formatPEN(totalCents)} registrado.`);
        setOpen(false);
        setReference("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo registrar el pago.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center justify-end gap-1.5">
        <Input
          placeholder="Referencia (opcional)"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="h-8 w-36"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="w-32 text-xs"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <Button type="button" size="sm" variant="ghost" disabled={isPending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="button" size="sm" disabled={isPending} onClick={confirmar}>
          Confirmar {formatPEN(disponibleCents)}
        </Button>
      </div>
    </div>
  );
}
