import Link from "next/link";
import { CalendarDays, PenSquare, Users } from "lucide-react";
import { env } from "@/env";
import { requireUser } from "@/modules/auth/session";
import { listInstructorCourses } from "@/modules/catalog/queries";
import { categoryColor } from "@/modules/catalog/category-colors";
import { formatPEN } from "@/lib/money";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { NewCourseDialog } from "@/modules/catalog/ui/new-course-dialog";
import { DeleteCourseButton } from "@/modules/catalog/ui/delete-course-button";
import { CopyCourseLinkButton } from "@/modules/catalog/ui/share-course-link";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
};

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-warning/15 text-warning-foreground",
  published: "bg-success/15 text-success",
  archived: "bg-muted text-muted-foreground",
};

const LEVEL_LABEL: Record<string, string> = {
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

export default async function InstructorCoursesPage() {
  const u = await requireUser();
  const [cursos, cats] = await Promise.all([
    listInstructorCourses(u.id),
    db.select({ id: categories.id, name: categories.name }).from(categories),
  ]);

  const publicados = cursos.filter((c) => c.status === "published").length;
  const totalInscritos = cursos.reduce((sum, c) => sum + c.enrolledCount, 0);
  const precioPromedio =
    cursos.length > 0
      ? Math.round(cursos.reduce((sum, c) => sum + c.priceCents, 0) / cursos.length)
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mis cursos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cursos.length === 0
              ? "Todavía no tienes cursos."
              : `${cursos.length} curso${cursos.length === 1 ? "" : "s"} · ${publicados} publicado${publicados === 1 ? "" : "s"}`}
          </p>
        </div>
        <NewCourseDialog categories={cats} />
      </div>

      {cursos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-muted-foreground">Todavía no tienes cursos. Crea el primero.</p>
          <div className="mt-4 flex justify-center">
            <NewCourseDialog categories={cats} triggerLabel="Crear mi primer curso" />
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cursos totales
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{cursos.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Publicados
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{publicados}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Alumnos inscritos
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{totalInscritos}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Precio promedio
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{formatPEN(precioPromedio)}</p>
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

              return (
                <article
                  key={c.id}
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
                    <div className="flex gap-1">
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide">
                        {c.deliveryMode === "en_vivo" ? "En vivo" : "Grabado"}
                      </span>
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide">
                        {LEVEL_LABEL[c.level]}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug tracking-tight">{c.title}</h3>
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${STATUS_CLASS[c.status]}`}
                      >
                        {STATUS_LABEL[c.status]}
                      </span>
                    </div>
                    {c.subtitle && (
                      <p className="text-[0.8rem] leading-snug text-muted-foreground">{c.subtitle}</p>
                    )}

                    <div className="mt-0.5 flex gap-3 text-[0.76rem] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5 opacity-60" />
                        {c.sessionCount} sesion{c.sessionCount === 1 ? "" : "es"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5 opacity-60" />
                        {c.enrolledCount} inscrito{c.enrolledCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                      <span className="text-base font-bold tabular-nums">{formatPEN(c.priceCents)}</span>
                      <div className="flex gap-1.5">
                        {c.status === "published" && (
                          <CopyCourseLinkButton url={`${env.NEXT_PUBLIC_APP_URL}/cursos/${c.slug}`} />
                        )}
                        <Link
                          href={`/instructor/cursos/${c.id}/sesiones`}
                          aria-label="Sesiones"
                          title="Sesiones"
                          className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <CalendarDays className="size-3.5" />
                        </Link>
                        <Link
                          href={`/instructor/cursos/${c.id}`}
                          aria-label="Editar"
                          title="Editar"
                          className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <PenSquare className="size-3.5" />
                        </Link>
                        <DeleteCourseButton courseId={c.id} courseTitle={c.title} />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
