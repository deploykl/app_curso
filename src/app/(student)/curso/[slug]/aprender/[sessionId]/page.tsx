import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileDown,
  Radio,
  Video,
} from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getSessionDetail } from "@/modules/learning/queries";
import { attendanceButtonLabel } from "@/modules/learning/service";
import { formatLima } from "@/lib/datetime";
import { presignGet } from "@/lib/r2";
import { Badge } from "@/components/ui/badge";
import { MarcarProgresoButton } from "@/modules/learning/ui/marcar-progreso-button";
import { DescargarMaterialButton } from "@/modules/learning/ui/descargar-material-button";

// Duración larga: el alumno puede tardarse viendo el video, no es una descarga puntual.
const VIDEO_URL_EXPIRES_SECONDS = 6 * 60 * 60;

const STATE_LABEL: Record<string, string> = {
  upcoming: "Próxima",
  live: "En vivo",
  past: "Finalizada",
};

const STATE_BADGE_VARIANT: Record<string, "secondary" | "default" | "outline"> = {
  upcoming: "outline",
  live: "default",
  past: "secondary",
};

function formatDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`;
}

export default async function SesionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const u = await requireUser();

  let session;
  try {
    session = await getSessionDetail(u.id, sessionId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!session) notFound();

  const videoUrl = session.videoFileKey
    ? await presignGet(session.videoFileKey, VIDEO_URL_EXPIRES_SECONDS)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/curso/${slug}/aprender`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver al curso
      </Link>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_280px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <Link
              href={`/curso/${slug}/aprender`}
              className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <BookOpen className="size-3.5" />
              {session.courseTitle}
            </Link>

            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{session.title}</h1>
              {session.deliveryMode === "en_vivo" && (
                <Badge
                  variant={STATE_BADGE_VARIANT[session.state]}
                  className={session.state === "live" ? "gap-1" : undefined}
                >
                  {session.state === "live" && <Radio className="size-3 animate-pulse" />}
                  {STATE_LABEL[session.state]}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
              {session.startsAt && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" />
                  {formatLima(session.startsAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" />
                {formatDuracion(session.durationMinutes)}
              </span>
            </div>

            {session.descriptionMd && (
              <p className="whitespace-pre-line border-t border-border pt-3 text-sm leading-relaxed text-muted-foreground">
                {session.descriptionMd}
              </p>
            )}
          </div>

          {session.deliveryMode === "grabado" ? (
            videoUrl ? (
              <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-foreground/10">
                <video controls className="h-full w-full" src={videoUrl} />
              </div>
            ) : (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 text-center">
                <Video className="size-8 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">El instructor todavía no sube el video de esta clase.</p>
              </div>
            )
          ) : null}

          {session.deliveryMode === "grabado" && session.tieneExamenPublicado && (
            <Link
              href={`/curso/${slug}/examen`}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
            >
              <div className="flex items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                  <Award className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">Rinde el examen y obtén tu certificado</p>
                  <p className="text-xs text-muted-foreground">Disponible cuando termines de ver las clases del curso.</p>
                </div>
              </div>
              <span className="whitespace-nowrap text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
                Ir al examen →
              </span>
            </Link>
          )}

          {session.deliveryMode === "en_vivo" && (
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
              <div
                className={`grid size-11 shrink-0 place-items-center rounded-full ${
                  session.state === "live"
                    ? "bg-primary/15 text-primary"
                    : session.state === "upcoming"
                      ? "bg-muted text-muted-foreground"
                      : session.recordingUrl
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {session.state === "live" ? (
                  <Radio className="size-5 animate-pulse" />
                ) : (
                  <Video className="size-5" />
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {session.state === "live" && session.zoomUrl && (
                    <p className="text-sm font-medium">La clase está en vivo ahora.</p>
                  )}
                  {session.state === "live" && !session.zoomUrl && (
                    <p className="text-sm text-muted-foreground">
                      La clase está en vivo, pero aún no se registró el enlace de Zoom.
                    </p>
                  )}
                  {session.state === "upcoming" && session.zoomUrl && (
                    <p className="text-sm text-muted-foreground">
                      El enlace de Zoom se habilita 10 minutos antes de la clase.
                    </p>
                  )}
                  {session.state === "upcoming" && !session.zoomUrl && (
                    <p className="text-sm text-muted-foreground">
                      El enlace de Zoom aún no está disponible para esta clase.
                    </p>
                  )}
                  {session.state === "past" && session.recordingUrl && (
                    <p className="text-sm font-medium">La grabación de esta clase ya está disponible.</p>
                  )}
                  {session.state === "past" && !session.recordingUrl && (
                    <p className="text-sm text-muted-foreground">La grabación aún no está disponible.</p>
                  )}
                </div>

                {session.state === "live" && session.zoomUrl && (
                  <a
                    href={session.zoomUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
                  >
                    <Video className="size-4" />
                    Entrar a la clase (Zoom)
                  </a>
                )}
                {session.state === "past" && session.recordingUrl && (
                  <a
                    href={session.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit shrink-0 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
                  >
                    <Video className="size-4" />
                    Ver grabación
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
            {session.state === "upcoming" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="size-4" />
                Podrás marcar tu asistencia cuando empiece la clase.
              </p>
            ) : session.attended ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" />
                Ya marcaste esta sesión.
              </p>
            ) : (
              <MarcarProgresoButton
                sessionId={session.id}
                label={attendanceButtonLabel(session.state)}
                alreadyMarked={session.attended}
              />
            )}
          </div>
        </div>

        {session.materials.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <FileDown className="size-4 text-muted-foreground" />
              Materiales
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {session.materials.length}
              </span>
            </h2>
            <div className="flex flex-col items-start gap-2">
              {session.materials.map((m) => (
                <DescargarMaterialButton key={m.id} materialId={m.id} title={m.title} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
