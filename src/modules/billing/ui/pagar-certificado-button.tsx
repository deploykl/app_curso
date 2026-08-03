"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, Loader2Icon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearOrdenCertificado } from "@/modules/billing/actions";

/** Igual que EnrollButton, pero para desbloquear un certificado ya emitido. */
export function PagarCertificadoButton({ courseId, label }: { courseId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onClick() {
    setError("");
    startTransition(async () => {
      try {
        const { orderNumber } = await crearOrdenCertificado(courseId);
        router.push(`/pago/${orderNumber}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos crear tu orden.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button type="button" size="sm" onClick={onClick} disabled={pending} className="w-full">
        {pending ? <Loader2Icon className="animate-spin" /> : <Lock className="size-3.5" />}
        {pending ? "Procesando..." : label}
      </Button>
      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
