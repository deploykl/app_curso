"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, HelpCircle, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { eliminarPregunta } from "@/modules/assessment/actions";
import { QuestionFormDialog } from "./question-form-dialog";
import type { QuestionFormValues } from "./question-form";

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
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <HelpCircle className="size-7 text-muted-foreground/60" />
        <p className="text-sm text-muted-foreground">Todavía no hay preguntas. Agrega la primera abajo.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visibles.map((p, i) => {
        const valores: QuestionFormValues = {
          type: p.type,
          promptMd: p.promptMd,
          explanationMd: p.explanationMd,
          points: p.points,
          opciones: p.opciones.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
        };

        return (
          <li key={p.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium leading-relaxed">
                  <span className="text-muted-foreground">{i + 1}.</span> {p.promptMd}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {p.type === "mcq" ? "Opción múltiple" : "Verdadero / Falso"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {p.points} {p.points === 1 ? "punto" : "puntos"}
                  </span>
                </div>
                <ul className="mt-1 flex flex-col gap-1 text-sm">
                  {p.opciones.map((o) => (
                    <li
                      key={o.id}
                      className={`flex items-center gap-1.5 ${
                        o.isCorrect ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {o.isCorrect ? (
                        <CheckCircle2 className="size-3.5 shrink-0" />
                      ) : (
                        <X className="size-3.5 shrink-0 opacity-0" />
                      )}
                      {o.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <QuestionFormDialog courseId={courseId} questionId={p.id} initialValues={valores} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar pregunta"
                  title="Eliminar"
                  disabled={isPending}
                  onClick={() => borrar(p.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
