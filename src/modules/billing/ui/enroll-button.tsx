"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { crearOrden } from "@/modules/billing/actions";

/**
 * Crea la orden. Si el curso es gratis, `crearOrden` inscribe de inmediato
 * (sin comprobante ni aprobación) y este botón manda directo al curso; si no,
 * lleva a la página de pago manual (Yape / Plin / transferencia). Los casos
 * "ya inscrito", "orden pendiente" y "correo sin verificar" se resuelven en
 * el servidor, así que aquí solo llega quien puede comprar/inscribirse.
 */
export function EnrollButton({ courseId, courseSlug, free = false }: { courseId: string; courseSlug: string; free?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onClick() {
    setError("");
    startTransition(async () => {
      try {
        const { orderNumber, freeEnrollment } = await crearOrden(courseId);
        if (freeEnrollment) {
          toast.success("Inscripción gratuita completada.");
          router.push(`/curso/${courseSlug}/aprender`);
        } else {
          router.push(`/pago/${orderNumber}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "No pudimos crear tu orden.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button size="xl" onClick={onClick} disabled={pending}>
        {pending && <Loader2Icon className="animate-spin" />}
        {pending ? "Procesando..." : free ? "Inscribirme gratis" : "Inscribirme"}
      </Button>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-right text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
