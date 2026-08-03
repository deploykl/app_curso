import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getResultado } from "@/modules/assessment/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";

export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const u = await requireUser();

  let resultado;
  try {
    resultado = await getResultado(u.id, attemptId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!resultado || resultado.courseSlug !== slug) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/curso/${slug}/examen`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver al examen
      </Link>

      <div
        className={`flex flex-col gap-4 rounded-xl border p-6 ${
          resultado.passed ? "border-success/30 bg-success/5" : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {resultado.courseTitle}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{resultado.examTitle}</h1>
            <p className="text-xs text-muted-foreground">Enviado el {formatLima(resultado.submittedAt)}</p>
          </div>

          <div
            className={`grid size-14 shrink-0 place-items-center rounded-full ${
              resultado.passed ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
            }`}
          >
            {resultado.passed ? <CheckCircle2 className="size-7" /> : <XCircle className="size-7" />}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border/70 pt-4">
          <span className="text-4xl font-bold tabular-nums tracking-tight">{resultado.scorePct}%</span>
          <Badge variant={resultado.passed ? "default" : "secondary"} className="mb-1">
            {resultado.passed ? "Aprobado" : "Desaprobado"}
          </Badge>
          <span className="mb-1 text-sm text-muted-foreground">
            · necesitabas {resultado.passingScore}% para aprobar
          </span>
        </div>

        {resultado.passed && (
          <div className="flex items-center gap-2.5 rounded-lg bg-success/10 p-3 text-sm text-success">
            <Award className="size-4 shrink-0" />
            ¡Felicitaciones! Tu certificado estará disponible pronto.
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-muted-foreground" />
          Revisión de preguntas
        </h2>
        <ul className="flex flex-col gap-3">
          {resultado.preguntas.map((p) => (
            <li key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium leading-relaxed">
                  <span className="text-muted-foreground">{p.numero}.</span> {p.promptMd}
                </p>
                <Badge
                  variant={p.acerto ? "default" : "secondary"}
                  className="shrink-0 gap-1"
                >
                  {p.acerto ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                  {p.acerto ? "Correcta" : "Incorrecta"}
                </Badge>
              </div>

              <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                {p.opciones.map((o) => {
                  const elegida = o.id === p.seleccionadaId;
                  return (
                    <li
                      key={o.id}
                      className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 ${
                        o.isCorrect
                          ? "bg-success/10 text-success"
                          : elegida
                            ? "bg-destructive/10 text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {o.isCorrect ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                      ) : elegida ? (
                        <XCircle className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <span className="mt-0.5 size-4 shrink-0" />
                      )}
                      <span>
                        {o.text}
                        {elegida && <span className="ml-2 text-xs opacity-80">(tu respuesta)</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {p.explanationMd && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <span>{p.explanationMd}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
