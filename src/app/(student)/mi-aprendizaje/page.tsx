import Link from "next/link";
import { CalendarDays, CheckCircle2, GraduationCap, PlayCircle, Radio } from "lucide-react";
import { requireUser } from "@/modules/auth/session";
import { listMyCourses } from "@/modules/learning/queries";
import { computeProgress, daysUntilLabel } from "@/modules/learning/service";
import { categoryColor } from "@/modules/catalog/category-colors";
import { formatLima } from "@/lib/datetime";
import { buttonVariants } from "@/components/ui/button";
import { CountdownTimer } from "@/components/countdown-timer";

export default async function MiAprendizajePage() {
  const u = await requireUser();
  const cursos = await listMyCourses(u.id);

  if (cursos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <GraduationCap className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">Todavía no tienes cursos.</p>
        <Link href="/cursos" className={buttonVariants({ className: "mt-4" })}>
          Explora el catálogo
        </Link>
      </div>
    );
  }

  const enCurso = cursos.filter(
    (c) => computeProgress(c.totalSessions, c.attendedSessions) < 100
  ).length;
  const totalSesionesVistas = cursos.reduce((sum, c) => sum + c.attendedSessions, 0);
  const promedioAvance =
    cursos.length > 0
      ? Math.round(
          cursos.reduce((sum, c) => sum + computeProgress(c.totalSessions, c.attendedSessions), 0) /
            cursos.length
        )
      : 0;
  // Server Component: leer el reloj en cada request es intencional, no una fuente de
  // inconsistencia de render.
  // eslint-disable-next-line react-hooks/purity
  const ahora = Date.now();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mi aprendizaje</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cursos.length} curso{cursos.length === 1 ? "" : "s"} · {enCurso} en curso
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cursos
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{cursos.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            En curso
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{enCurso}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sesiones vistas
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{totalSesionesVistas}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Avance promedio
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{promedioAvance}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cursos.map((c) => {
          const color = categoryColor(c.categoryName);
          const monogram = c.title
            .split(/\s+/)
            .slice(0, 2)
            .map((w) => w[0])
            .join("")
            .toUpperCase();
          const percent = computeProgress(c.totalSessions, c.attendedSessions);
          const completado = percent >= 100;
          const msHastaInicio = c.nextSession
            ? c.nextSession.startsAt.getTime() - ahora
            : 0;
          const mostrarMinutero =
            c.nextSession?.state === "upcoming" && msHastaInicio <= 4 * 24 * 60 * 60 * 1000;

          return (
            <Link
              key={c.courseId}
              href={`/curso/${c.slug}/aprender`}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-lg"
            >
              <div
                className="flex h-24 items-center justify-between px-4 text-white"
                style={{
                  background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color}, black 20%))`,
                }}
              >
                <div className="grid size-10 place-items-center rounded-lg bg-white/20 text-sm font-bold backdrop-blur-sm">
                  {monogram}
                </div>
                {completado ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide">
                    <CheckCircle2 className="size-3" />
                    Completado
                  </span>
                ) : c.nextSession?.state === "live" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide">
                    <Radio className="size-3 animate-pulse" />
                    En vivo
                  </span>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-sm font-semibold leading-snug tracking-tight">{c.title}</h3>
                {c.subtitle && (
                  <p className="text-[0.8rem] leading-snug text-muted-foreground">{c.subtitle}</p>
                )}

                <div className="mt-1 flex flex-col gap-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-[0.72rem] text-muted-foreground">
                    {c.attendedSessions}/{c.totalSessions} sesion{c.totalSessions === 1 ? "" : "es"} · {percent}%
                  </span>
                </div>

                <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3 text-[0.78rem]">
                  {c.nextSession ? (
                    c.nextSession.state === "past" ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <CheckCircle2 className="size-3.5 opacity-60" />
                        Curso finalizado
                      </span>
                    ) : c.nextSession.state === "live" ? (
                      <span className="inline-flex items-center gap-1.5 font-medium text-success">
                        <PlayCircle className="size-3.5" />
                        {c.nextSession.title}
                      </span>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <CalendarDays className="size-3.5 opacity-60" />
                          {daysUntilLabel(c.nextSession.startsAt)} · {c.nextSession.title} (
                          {formatLima(c.nextSession.startsAt)})
                        </span>
                        {mostrarMinutero && (
                          <CountdownTimer startsAt={c.nextSession.startsAt} />
                        )}
                      </>
                    )
                  ) : (
                    <span className="text-muted-foreground">
                      {c.deliveryMode === "grabado" ? "Curso grabado: disponible cuando quieras." : "Sin sesiones programadas."}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
