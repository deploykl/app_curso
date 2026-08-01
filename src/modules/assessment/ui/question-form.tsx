"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { guardarPregunta } from "@/modules/assessment/actions";

export interface QuestionFormValues {
  type: "mcq" | "true_false";
  promptMd: string;
  explanationMd: string | null;
  points: number;
  opciones: { text: string; isCorrect: boolean }[];
}

const VERDADERO_FALSO = [
  { text: "Verdadero", isCorrect: true },
  { text: "Falso", isCorrect: false },
];

export function QuestionForm({
  courseId,
  questionId,
  initialValues,
  onDone,
}: {
  courseId: string;
  questionId?: string;
  initialValues?: QuestionFormValues;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState<"mcq" | "true_false">(initialValues?.type ?? "mcq");
  const [opciones, setOpciones] = useState(
    initialValues?.opciones ?? [
      { text: "", isCorrect: true },
      { text: "", isCorrect: false },
    ]
  );

  function cambiarTipo(nuevo: "mcq" | "true_false") {
    setTipo(nuevo);
    if (nuevo === "true_false") setOpciones(VERDADERO_FALSO);
  }

  function marcarCorrecta(indice: number) {
    setOpciones((prev) => prev.map((o, i) => ({ ...o, isCorrect: i === indice })));
  }

  function cambiarTexto(indice: number, text: string) {
    setOpciones((prev) => prev.map((o, i) => (i === indice ? { ...o, text } : o)));
  }

  function agregarOpcion() {
    setOpciones((prev) => (prev.length >= 8 ? prev : [...prev, { text: "", isCorrect: false }]));
  }

  function quitarOpcion(indice: number) {
    setOpciones((prev) => {
      if (prev.length <= 2) return prev;
      const resto = prev.filter((_, i) => i !== indice);
      return resto.some((o) => o.isCorrect)
        ? resto
        : resto.map((o, i) => ({ ...o, isCorrect: i === 0 }));
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);

    const raw = {
      type: tipo,
      promptMd: String(form.get("promptMd") ?? ""),
      explanationMd: String(form.get("explanationMd") ?? "").trim() || null,
      points: Number(form.get("points") ?? 1),
      options: opciones.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    };

    startTransition(async () => {
      try {
        await guardarPregunta(courseId, questionId ?? null, raw);
        toast.success(questionId ? "Pregunta actualizada." : "Pregunta agregada.");
        if (!questionId) {
          (e.target as HTMLFormElement).reset();
          setOpciones([
            { text: "", isCorrect: true },
            { text: "", isCorrect: false },
          ]);
        }
        router.refresh();
        onDone?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos guardar la pregunta.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="type">Tipo</Label>
          <select
            id="type"
            value={tipo}
            onChange={(e) => cambiarTipo(e.target.value as "mcq" | "true_false")}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="mcq">Opción múltiple</option>
            <option value="true_false">Verdadero / Falso</option>
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="points">Puntos</Label>
          <Input id="points" name="points" type="number" min={1} max={100} required
                 defaultValue={initialValues?.points ?? 1} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="promptMd">Enunciado</Label>
        <Textarea id="promptMd" name="promptMd" rows={2} required
                  defaultValue={initialValues?.promptMd ?? ""} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Opciones</Label>
        <p className="text-xs text-muted-foreground">Marca el círculo de la opción correcta.</p>
        {opciones.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correcta"
              checked={o.isCorrect}
              onChange={() => marcarCorrecta(i)}
              aria-label={`Marcar opción ${i + 1} como correcta`}
            />
            <Input
              value={o.text}
              onChange={(e) => cambiarTexto(i, e.target.value)}
              placeholder={`Opción ${i + 1}`}
              required
              readOnly={tipo === "true_false"}
            />
            {tipo === "mcq" && opciones.length > 2 && (
              <Button type="button" variant="ghost" onClick={() => quitarOpcion(i)}>
                Quitar
              </Button>
            )}
          </div>
        ))}
        {tipo === "mcq" && opciones.length < 8 && (
          <Button type="button" variant="outline" onClick={agregarOpcion} className="self-start">
            Agregar opción
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="explanationMd">Explicación (se muestra en los resultados)</Label>
        <Textarea id="explanationMd" name="explanationMd" rows={2}
                  defaultValue={initialValues?.explanationMd ?? ""} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : questionId ? "Guardar cambios" : "Agregar pregunta"}
      </Button>
    </form>
  );
}
