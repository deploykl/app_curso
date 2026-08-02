"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClassSession, updateClassSession } from "@/modules/catalog/session-actions";

interface SessionFormValues {
  title: string;
  startsAtLocal: string;
  durationMinutes: number;
  zoomUrl?: string | null;
  isFreePreview: boolean;
}

export function SessionForm({
  courseId,
  sessionId,
  initialValues,
  onDone,
}: {
  courseId: string;
  sessionId?: string;
  initialValues?: SessionFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);

    const raw = {
      title: String(form.get("title") ?? ""),
      startsAtLocal: String(form.get("startsAtLocal") ?? ""),
      durationMinutes: Number(form.get("durationMinutes") ?? 60),
      zoomUrl: String(form.get("zoomUrl") ?? "") || "",
      isFreePreview: form.get("isFreePreview") === "on",
    };

    startTransition(async () => {
      try {
        if (sessionId) {
          await updateClassSession(sessionId, raw);
          toast.success("Sesión actualizada.");
        } else {
          await createClassSession(courseId, raw);
          toast.success("Sesión creada.");
          (e.target as HTMLFormElement).reset();
        }
        router.refresh();
        onDone?.();
      } catch (e) {
        const message = e instanceof Error ? e.message : "No pudimos guardar la sesión.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input id="title" name="title" required minLength={3} defaultValue={initialValues?.title} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="startsAtLocal">Fecha y hora</Label>
          <Input
            id="startsAtLocal"
            name="startsAtLocal"
            type="datetime-local"
            required
            defaultValue={initialValues?.startsAtLocal}
          />
          <p className="text-xs text-muted-foreground">La hora se interpreta en horario de Perú (Lima).</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="durationMinutes">Duración (min)</Label>
          <Input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={1}
            max={480}
            required
            defaultValue={initialValues?.durationMinutes ?? 60}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="zoomUrl">Enlace de Zoom / Meet / Teams</Label>
        <Input id="zoomUrl" name="zoomUrl" type="url" defaultValue={initialValues?.zoomUrl ?? ""} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isFreePreview" defaultChecked={initialValues?.isFreePreview} />
        Vista previa gratuita
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : sessionId ? "Guardar cambios" : "Agregar sesión"}
      </Button>
    </form>
  );
}
