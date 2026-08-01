"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eliminarPregunta } from "@/modules/assessment/actions";
import { QuestionForm, type QuestionFormValues } from "./question-form";

export interface PreguntaListItem {
  id: string;
  type: "mcq" | "true_false";
  promptMd: string;
  explanationMd: string | null;
  points: number;
  isActive: boolean;
  opciones: { id: string; text: string; isCorrect: boolean }[];
}

export function QuestionList({
  courseId,
  preguntas,
}: {
  courseId: string;
  preguntas: PreguntaListItem[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function borrar(id: string) {
    startTransition(async () => {
      try {
        await eliminarPregunta(courseId, id);
        toast.success("Pregunta eliminada.");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No pudimos eliminar la pregunta.");
      }
    });
  }

  // Las preguntas archivadas (isActive: false) ya no cuentan para el examen;
  // no se muestran en el banco (siguen en la base de datos por si en el futuro
  // hace falta auditarlas, pero eso no es cosa de esta vista).
  const visibles = preguntas.filter((p) => p.isActive);

  if (visibles.length === 0) {
    return <p className="text-muted-foreground">Todavía no hay preguntas. Agrega la primera abajo.</p>;
  }

  return (
    <ul className="flex flex-col gap-4">
      {visibles.map((p, i) => {
        const valores: QuestionFormValues = {
          type: p.type,
          promptMd: p.promptMd,
          explanationMd: p.explanationMd,
          points: p.points,
          opciones: p.opciones.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
        };

        return (
          <li key={p.id} className="rounded-md border border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium">
                  {i + 1}. {p.promptMd}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {p.type === "mcq" ? "Opción múltiple" : "Verdadero / Falso"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {p.points} {p.points === 1 ? "punto" : "puntos"}
                  </span>
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                  {p.opciones.map((o) => (
                    <li key={o.id}>
                      {o.isCorrect ? "✓ " : "· "}
                      {o.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditando(editando === p.id ? null : p.id)}
                >
                  {editando === p.id ? "Cerrar" : "Editar"}
                </Button>
                <Button type="button" variant="ghost" disabled={isPending} onClick={() => borrar(p.id)}>
                  Eliminar
                </Button>
              </div>
            </div>

            {editando === p.id && (
              <div className="mt-4">
                <QuestionForm
                  courseId={courseId}
                  questionId={p.id}
                  initialValues={valores}
                  onDone={() => setEditando(null)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
