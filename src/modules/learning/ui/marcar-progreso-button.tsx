"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { marcarProgreso } from "@/modules/learning/actions";

export function MarcarProgresoButton({
  sessionId, label, alreadyMarked,
}: {
  sessionId: string; label: string; alreadyMarked: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function onClick() {
    setSubmitting(true);
    try {
      await marcarProgreso(sessionId);
      toast.success("Progreso registrado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo registrar el progreso.");
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyMarked) {
    return <p className="text-sm text-muted-foreground">✓ Ya marcaste esta sesión.</p>;
  }

  return (
    <Button type="button" onClick={onClick} disabled={submitting}>
      {submitting ? "Guardando..." : label}
    </Button>
  );
}
