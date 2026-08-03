"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guardarExamen } from "@/modules/assessment/actions";

interface ExamSettingsValues {
  title: string;
  passingScore: number;
  maxAttempts: number;
  lockoutHours: number;
  timeLimitMinutes: number | null;
  questionsPerAttempt: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

const VACIO: ExamSettingsValues = {
  title: "Examen final",
  passingScore: 70,
  maxAttempts: 3,
  lockoutHours: 24,
  timeLimitMinutes: null,
  questionsPerAttempt: null,
  shuffleQuestions: true,
  shuffleOptions: true,
};

/** "" -> null; "12" -> 12. Los campos opcionales van vacíos, no en cero. */
function numeroOpcional(valor: FormDataEntryValue | null): number | null {
  const s = String(valor ?? "").trim();
  return s === "" ? null : Number(s);
}

export function ExamSettingsForm({
  courseId,
  initialValues,
}: {
  courseId: string;
  initialValues?: ExamSettingsValues;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const v = initialValues ?? VACIO;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);

    const raw = {
      title: String(form.get("title") ?? ""),
      passingScore: Number(form.get("passingScore") ?? 70),
      maxAttempts: Number(form.get("maxAttempts") ?? 3),
      lockoutHours: Number(form.get("lockoutHours") ?? 24),
      timeLimitMinutes: numeroOpcional(form.get("timeLimitMinutes")),
      questionsPerAttempt: numeroOpcional(form.get("questionsPerAttempt")),
      shuffleQuestions: form.get("shuffleQuestions") === "on",
      shuffleOptions: form.get("shuffleOptions") === "on",
    };

    startTransition(async () => {
      try {
        await guardarExamen(courseId, raw);
        toast.success("Examen guardado.");
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos guardar el examen.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título del examen</Label>
        <Input id="title" name="title" required minLength={3} defaultValue={v.title} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="passingScore">Nota de aprobación (%)</Label>
            <Input id="passingScore" name="passingScore" type="number" min={1} max={100} required
                   defaultValue={v.passingScore} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="maxAttempts">Intentos permitidos</Label>
            <Input id="maxAttempts" name="maxAttempts" type="number" min={1} max={10} required
                   defaultValue={v.maxAttempts} />
          </div>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="lockoutHours">Bloqueo tras agotarlos (horas)</Label>
            <Input id="lockoutHours" name="lockoutHours" type="number" min={0} max={168} required
                   defaultValue={v.lockoutHours} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="timeLimitMinutes">Límite de tiempo (min)</Label>
            <Input id="timeLimitMinutes" name="timeLimitMinutes" type="number" min={1} max={480}
                   defaultValue={v.timeLimitMinutes ?? ""} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Deja el límite de tiempo vacío para no limitarlo.</p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="questionsPerAttempt">Preguntas por intento</Label>
          <Input id="questionsPerAttempt" name="questionsPerAttempt" type="number" min={1} max={200}
                 defaultValue={v.questionsPerAttempt ?? ""} />
          <p className="text-xs text-muted-foreground">Vacío = todas las preguntas del banco.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="shuffleQuestions"
            defaultChecked={v.shuffleQuestions}
            className="size-4 accent-primary"
          />
          Barajar el orden de las preguntas
        </label>
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="shuffleOptions"
            defaultChecked={v.shuffleOptions}
            className="size-4 accent-primary"
          />
          Barajar el orden de las opciones
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar configuración"}
      </Button>
    </form>
  );
}
