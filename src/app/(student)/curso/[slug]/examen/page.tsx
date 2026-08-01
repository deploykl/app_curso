import Link from "next/link";
import { notFound } from "next/navigation";
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
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-semibold">{previo.examTitle}</h1>
          <p className="text-sm text-muted-foreground">{previo.courseTitle}</p>
        </div>
        <Link href={`/curso/${previo.courseSlug}/aprender`} className="text-sm text-primary hover:underline">
          Volver a la agenda
        </Link>
      </div>

      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>{previo.totalPreguntas} preguntas.</li>
        <li>Necesitas {previo.passingScore}% para aprobar.</li>
        <li>Hasta {previo.maxAttempts} intentos.</li>
        <li>
          {previo.timeLimitMinutes
            ? `Tienes ${previo.timeLimitMinutes} minutos por intento.`
            : "Sin límite de tiempo."}
        </li>
      </ul>

      {aprobado && (
        <div className="rounded-md border border-border p-4">
          <p className="font-medium">Ya aprobaste este examen. ¡Felicitaciones!</p>
          <p className="text-sm text-muted-foreground">Tu certificado estará disponible pronto.</p>
        </div>
      )}

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
        <p className="text-sm text-destructive">
          Agotaste tus intentos. Podrás volver a intentarlo el{" "}
          {previo.desbloqueaA ? formatLima(previo.desbloqueaA) : "más adelante"}.
        </p>
      )}

      {previo.intentos.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Tus intentos</h2>
          <ul className="flex flex-col gap-2">
            {previo.intentos.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <span className="text-sm">
                  Intento {i.attemptNumber}
                  {i.submittedAt && ` · ${formatLima(i.submittedAt)}`}
                </span>
                <span className="flex items-center gap-3">
                  <Badge variant={i.passed ? "default" : "secondary"}>
                    {i.passed ? "Aprobado" : "Desaprobado"}
                  </Badge>
                  <span className="text-sm font-medium">{i.scorePct ?? 0}%</span>
                  <Link
                    href={`/curso/${previo.courseSlug}/examen/${i.id}/resultado`}
                    className="text-sm text-primary hover:underline"
                  >
                    Ver resultado
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
