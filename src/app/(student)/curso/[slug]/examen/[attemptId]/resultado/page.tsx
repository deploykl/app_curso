import Link from "next/link";
import { notFound } from "next/navigation";
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
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">Resultado — {resultado.examTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {resultado.courseTitle} · {formatLima(resultado.submittedAt)}
          </p>
        </div>
        <Link href={`/curso/${slug}/examen`} className="text-sm text-primary hover:underline">
          Volver al examen
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-border p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-semibold">{resultado.scorePct}%</span>
          <Badge variant={resultado.passed ? "default" : "secondary"}>
            {resultado.passed ? "Aprobado" : "Desaprobado"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Necesitabas {resultado.passingScore}% para aprobar.
        </p>
        {resultado.passed && (
          <p className="text-sm text-muted-foreground">Tu certificado estará disponible pronto.</p>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Revisión</h2>
        <ul className="flex flex-col gap-4">
          {resultado.preguntas.map((p) => (
            <li key={p.id} className="rounded-md border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium">
                  {p.numero}. {p.promptMd}
                </p>
                <Badge variant={p.acerto ? "default" : "secondary"}>
                  {p.acerto ? "Correcta" : "Incorrecta"}
                </Badge>
              </div>

              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {p.opciones.map((o) => {
                  const elegida = o.id === p.seleccionadaId;
                  const clase = o.isCorrect
                    ? "text-foreground"
                    : elegida
                      ? "text-destructive"
                      : "text-muted-foreground";
                  return (
                    <li key={o.id} className={clase}>
                      {o.isCorrect ? "✓ " : elegida ? "✗ " : "· "}
                      {o.text}
                      {elegida && <span className="ml-2 text-xs">(tu respuesta)</span>}
                    </li>
                  );
                })}
              </ul>

              {p.explanationMd && (
                <p className="mt-3 text-sm text-muted-foreground">{p.explanationMd}</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
