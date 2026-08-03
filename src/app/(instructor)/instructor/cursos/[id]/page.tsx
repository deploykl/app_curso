import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { db } from "@/db";
import { categories, classSessions, sessionMaterials } from "@/db/schema";
import { env } from "@/env";
import { requireUser } from "@/modules/auth/session";
import { canManageCourse, type Role } from "@/modules/auth/guards";
import { getCourseById } from "@/modules/catalog/queries";
import { CourseForm } from "@/modules/catalog/ui/course-form";
import { CourseVideoField } from "@/modules/catalog/ui/course-video-field";
import { PublishButton } from "@/modules/catalog/ui/publish-button";
import { SessionList } from "@/modules/catalog/ui/session-list";
import { ShareCourseLink } from "@/modules/catalog/ui/share-course-link";

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

export default async function EditarCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const course = await getCourseById(id);

  if (!course || !canManageCourse(u.id, u.role as Role, course.instructorId)) {
    notFound();
  }

  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);

  const rawSessions = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.courseId, course.id))
    .orderBy(asc(classSessions.orderIndex));

  const sessionIds = rawSessions.map((s) => s.id);
  const materials = sessionIds.length
    ? await db.select().from(sessionMaterials).where(inArray(sessionMaterials.classSessionId, sessionIds))
    : [];

  const sessions = rawSessions.map((s) => ({
    ...s,
    materials: materials
      .filter((m) => m.classSessionId === s.id)
      .map((m) => ({ id: m.id, title: m.title, fileKey: m.fileKey, externalUrl: m.externalUrl })),
  }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/instructor"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Mis cursos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_CLASS[course.status]}`}
          >
            {STATUS_LABEL[course.status]}
          </span>
          <span className="whitespace-nowrap rounded-full bg-secondary px-2.5 py-0.5 text-xs font-bold text-secondary-foreground">
            {course.deliveryMode === "en_vivo" ? "En vivo" : "Grabado"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/instructor/cursos/${course.id}/examen`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ClipboardList className="size-4" />
            Examen
          </Link>
          <PublishButton courseId={course.id} status={course.status} />
        </div>
      </div>

      {course.status === "published" && (
        <ShareCourseLink url={`${env.NEXT_PUBLIC_APP_URL}/cursos/${course.slug}`} />
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1.55fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Detalles del curso</h2>
          <p className="mt-1 text-sm text-muted-foreground">Título, precio y todo lo que ven tus alumnos.</p>

          {course.deliveryMode === "grabado" && (
            <div className="mt-4">
              <CourseVideoField
                courseId={course.id}
                hasVideo={Boolean(sessions[0]?.videoFileKey)}
                durationMinutes={sessions[0]?.durationMinutes ?? 60}
              />
            </div>
          )}

          <div className="mt-4">
            <CourseForm
              categories={cats}
              courseId={course.id}
              initialValues={{
                title: course.title,
                subtitle: course.subtitle,
                descriptionMd: course.descriptionMd,
                categoryId: course.categoryId,
                level: course.level,
                priceSoles: (course.priceCents / 100).toFixed(2),
                certificatePriceSoles: course.certificatePriceCents
                  ? (course.certificatePriceCents / 100).toFixed(2)
                  : "",
              }}
            />
          </div>
        </section>

        <section id="sesiones" className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20">
          <SessionList courseId={course.id} deliveryMode={course.deliveryMode} sessions={sessions} />
        </section>
      </div>
    </div>
  );
}
