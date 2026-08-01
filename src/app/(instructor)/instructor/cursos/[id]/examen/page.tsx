import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { getBancoPreguntas } from "@/modules/assessment/queries";
import { Badge } from "@/components/ui/badge";
import { ExamSettingsForm } from "@/modules/assessment/ui/exam-settings-form";
import { QuestionForm } from "@/modules/assessment/ui/question-form";
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
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Examen — {banco.courseTitle}</h1>
        <Link href={`/instructor/cursos/${banco.courseId}`} className="text-sm text-primary hover:underline">
          Volver al curso
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium">Configuración</h2>
          {banco.examen && (
            <Badge variant={banco.examen.isPublished ? "default" : "secondary"}>
              {banco.examen.isPublished ? "Publicado" : "Borrador"}
            </Badge>
          )}
        </div>
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

      {banco.examen ? (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Banco de preguntas</h2>
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

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Agregar pregunta</h2>
            <QuestionForm courseId={banco.courseId} />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-medium">Publicación</h2>
            <p className="text-sm text-muted-foreground">
              Mientras el examen esté en borrador, tus alumnos no lo ven.
            </p>
            <PublishExamButton courseId={banco.courseId} isPublished={banco.examen.isPublished} />
          </section>
        </>
      ) : (
        <p className="text-muted-foreground">
          Guarda la configuración para empezar a agregar preguntas.
        </p>
      )}
    </div>
  );
}
