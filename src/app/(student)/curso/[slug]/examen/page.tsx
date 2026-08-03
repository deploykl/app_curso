import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award,
  ArrowLeft,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  RotateCcw,
  Target,
  XCircle,
} from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getExamenDeCurso } from "@/modules/assessment/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { IniciarIntentoButton } from "@/modules/assessment/ui/iniciar-intento-button";

export default async function ExamenPreviaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const u = await requireUser();

  let previo;
  try {
    previo = await getExamenDeCurso(u.id, slug);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!previo) notFound();

  const aprobado = previo.intentos.some((i) => i.passed);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/curso/${previo.courseSlug}/aprender`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver a la agenda
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Award className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {previo.courseTitle}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{previo.examTitle}</h1>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <HelpCircle className="size-3.5" />
            {previo.totalPreguntas} pregunta{previo.totalPreguntas === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Target className="size-3.5" />
            {previo.passingScore}% para aprobar
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <RotateCcw className="size-3.5" />
            Hasta {previo.maxAttempts} intento{previo.maxAttempts === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="size-3.5" />
            {previo.timeLimitMinutes ? `${previo.timeLimitMinutes} min por intento` : "Sin límite de tiempo"}
          </span>
        </div>
      </div>

      {aprobado && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">Ya aprobaste este examen. ¡Felicitaciones!</p>
            <p className="text-xs text-muted-foreground">Tu certificado estará disponible pronto.</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5">
        {previo.intentoEnCurso ? (
          <IniciarIntentoButton
            courseId={previo.courseId}
            courseSlug={previo.courseSlug}
            label="Continuar mi intento"
          />
        ) : previo.puedeIniciar ? (
          <IniciarIntentoButton
            courseId={previo.courseId}
            courseSlug={previo.courseSlug}
            label={previo.intentos.length === 0 ? "Iniciar examen" : "Intentar de nuevo"}
          />
        ) : (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <Lock className="size-4 shrink-0" />
            Agotaste tus intentos. Podrás volver a intentarlo el{" "}
            {previo.desbloqueaA ? formatLima(previo.desbloqueaA) : "más adelante"}.
          </p>
        )}
      </div>

      {previo.intentos.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-sm font-semibold">Tus intentos</h2>
          <div className="flex flex-col gap-2">
            {previo.intentos.map((i) => (
              <Link
                key={i.id}
                href={`/curso/${previo.courseSlug}/examen/${i.id}/resultado`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
              >
                <div
                  className={`grid size-10 shrink-0 place-items-center rounded-full ${
                    i.passed ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {i.passed ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-medium">Intento {i.attemptNumber}</p>
                  {i.submittedAt && (
                    <p className="text-xs text-muted-foreground">{formatLima(i.submittedAt)}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums">{i.scorePct ?? 0}%</span>
                  <Badge variant={i.passed ? "default" : "secondary"}>
                    {i.passed ? "Aprobado" : "Desaprobado"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
