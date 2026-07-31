import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { classSessions } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { canManageCourse, type Role } from "@/modules/auth/guards";
import { getCourseById } from "@/modules/catalog/queries";
import { SessionForm } from "@/modules/catalog/ui/session-form";
import { SessionList } from "@/modules/catalog/ui/session-list";

export default async function SesionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const course = await getCourseById(id);

  if (!course || !canManageCourse(u.id, u.role as Role, course.instructorId)) {
    notFound();
  }

  const sessions = await db
    .select()
    .from(classSessions)
    .where(eq(classSessions.courseId, course.id))
    .orderBy(asc(classSessions.orderIndex));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sesiones — {course.title}</h1>
        <Link href={`/instructor/cursos/${course.id}`} className="text-sm text-primary hover:underline">
          Volver al curso
        </Link>
      </div>

      <SessionList courseId={course.id} sessions={sessions} />

      <div>
        <h2 className="mb-3 text-lg font-medium">Agregar sesión</h2>
        <SessionForm courseId={course.id} />
      </div>
    </div>
  );
}
