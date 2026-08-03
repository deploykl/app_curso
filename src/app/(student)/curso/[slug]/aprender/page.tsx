import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  FileText,
  Play,
  Radio,
  Video,
} from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getCourseAgenda } from "@/modules/learning/queries";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";

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

export default async function AgendaCursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = await requireUser();

  let agenda;
  try {
    agenda = await getCourseAgenda(u.id, slug);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!agenda) notFound();

  const total = agenda.sessions.length;
  const vistas = agenda.sessions.filter((s) => s.attended).length;
  const percent = total > 0 ? Math.round((vistas / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/mi-aprendizaje"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Mi aprendizaje
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{agenda.title}</h1>
              <Badge variant="outline">
                {agenda.deliveryMode === "en_vivo" ? "En vivo" : "Grabado"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {total} sesión{total === 1 ? "" : "es"} · {vistas} vista{vistas === 1 ? "" : "s"}
            </p>
          </div>

          {agenda.tieneExamenPublicado && (
            <Link
              href={`/curso/${slug}/examen`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              <Award className="size-4" />
              Rendir el examen
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{percent}% completado</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {agenda.sessions.map((s, i) => (
          <Link
            key={s.id}
            href={`/curso/${slug}/aprender/${s.id}`}
            className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
          >
            <div
              className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                s.attended
                  ? "bg-success/15 text-success"
                  : s.state === "live"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s.attended ? <CheckCircle2 className="size-5" /> : i + 1}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-sm font-medium">{s.title}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {s.startsAt ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5" />
                    {formatLima(s.startsAt)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Play className="size-3.5" />
                    Disponible cuando quieras
                  </span>
                )}
                {s.hasRecording && (
                  <span className="inline-flex items-center gap-1">
                    <Video className="size-3.5" />
                    Video
                  </span>
                )}
                {s.materialCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="size-3.5" />
                    {s.materialCount} material{s.materialCount === 1 ? "" : "es"}
                  </span>
                )}
              </div>
            </div>

            <Badge
              variant={STATE_BADGE_VARIANT[s.state]}
              className={s.state === "live" ? "gap-1" : undefined}
            >
              {s.state === "live" && <Radio className="size-3 animate-pulse" />}
              {STATE_LABEL[s.state]}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
