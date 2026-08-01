"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { iniciarIntento } from "@/modules/assessment/actions";

export function IniciarIntentoButton({
  courseId,
  courseSlug,
  label,
}: {
  courseId: string;
  courseSlug: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onClick() {
    setError("");
    startTransition(async () => {
      try {
        const attemptId = await iniciarIntento(courseId);
        router.push(`/curso/${courseSlug}/examen/${attemptId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos iniciar el examen.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" disabled={isPending} onClick={onClick} className="self-start">
        {isPending ? "Abriendo..." : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
