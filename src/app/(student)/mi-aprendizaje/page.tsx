import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { listMyCourses } from "@/modules/learning/queries";
import { computeProgress, daysUntilLabel } from "@/modules/learning/service";
import { formatLima } from "@/lib/datetime";

export default async function MiAprendizajePage() {
  const u = await requireUser();
  const cursos = await listMyCourses(u.id);

  if (cursos.length === 0) {
    return (
      <p className="text-muted-foreground">
        Todavía no tienes cursos.{" "}
        <Link href="/cursos" className="underline">
          Explora el catálogo
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Mi aprendizaje</h1>
      {cursos.map((c) => {
        const percent = computeProgress(c.totalSessions, c.attendedSessions);
        return (
          <Link
            key={c.courseId}
            href={`/curso/${c.slug}/aprender`}
            className="flex flex-col gap-2 rounded-lg border border-border p-4 hover:bg-muted/40"
          >
            <h2 className="font-medium">{c.title}</h2>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {c.attendedSessions}/{c.totalSessions} sesiones vistas
            </p>
            {c.nextSession ? (
              c.nextSession.state === "past" ? (
                <p className="text-sm text-muted-foreground">Curso finalizado</p>
              ) : (
                <p className="text-sm">
                  {c.nextSession.state === "live" ? "EN VIVO AHORA" : daysUntilLabel(c.nextSession.startsAt)}
                  {" — "}
                  {c.nextSession.title} ({formatLima(c.nextSession.startsAt)})
                </p>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Sin sesiones programadas.</p>
            )}
          </Link>
        );
      })}
    </div>
  );
}
