import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, ListChecks, Send, Settings2 } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { getBancoPreguntas } from "@/modules/assessment/queries";
import { Badge } from "@/components/ui/badge";
import { ExamSettingsForm } from "@/modules/assessment/ui/exam-settings-form";
import { QuestionFormDialog } from "@/modules/assessment/ui/question-form-dialog";
import { QuestionList } from "@/modules/assessment/ui/question-list";
import { PublishExamButton } from "@/modules/assessment/ui/publish-exam-button";

export default async function ExamenInstructorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const u = await requireUser();
  const banco = await getBancoPreguntas(u.id, id);
  if (!banco) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/instructor/cursos/${banco.courseId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver al curso
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Award className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {banco.courseTitle}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">Examen del curso</h1>
          </div>
        </div>
        {banco.examen && (
          <Badge variant={banco.examen.isPublished ? "default" : "secondary"}>
            {banco.examen.isPublished ? "Publicado" : "Borrador"}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.6fr]">
        <div className="flex flex-col gap-6 lg:sticky lg:top-20">
          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Settings2 className="size-4 text-muted-foreground" />
              Configuración
            </h2>
            <ExamSettingsForm
              courseId={banco.courseId}
              initialValues={
                banco.examen
                  ? {
                      title: banco.examen.title,
                      passingScore: banco.examen.passingScore,
                      maxAttempts: banco.examen.maxAttempts,
                      lockoutHours: banco.examen.lockoutHours,
                      timeLimitMinutes: banco.examen.timeLimitMinutes,
                      questionsPerAttempt: banco.examen.questionsPerAttempt,
                      shuffleQuestions: banco.examen.shuffleQuestions,
                      shuffleOptions: banco.examen.shuffleOptions,
                    }
                  : undefined
              }
            />
          </section>

          {banco.examen && (
            <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Send className="size-4 text-muted-foreground" />
                Publicación
              </h2>
              <p className="text-sm text-muted-foreground">
                Mientras el examen esté en borrador, tus alumnos no lo ven.
              </p>
              <PublishExamButton courseId={banco.courseId} isPublished={banco.examen.isPublished} />
            </section>
          )}
        </div>

        {banco.examen ? (
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <ListChecks className="size-4 text-muted-foreground" />
                Banco de preguntas
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {banco.preguntas.filter((p) => p.isActive).length}
                </span>
              </h2>
              <QuestionFormDialog courseId={banco.courseId} />
            </div>
            <QuestionList
              courseId={banco.courseId}
              preguntas={banco.preguntas.map((p) => ({
                id: p.id,
                type: p.type,
                promptMd: p.promptMd,
                explanationMd: p.explanationMd,
                points: p.points,
                isActive: p.isActive,
                opciones: p.opciones.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
              }))}
            />
          </section>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground">
            Guarda la configuración para empezar a agregar preguntas.
          </p>
        )}
      </div>
    </div>
  );
}
