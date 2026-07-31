import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { canManageCourse, type Role } from "@/modules/auth/guards";
import { getCourseById } from "@/modules/catalog/queries";
import { CourseForm } from "@/modules/catalog/ui/course-form";
import { PublishButton } from "@/modules/catalog/ui/publish-button";

export default async function EditarCursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireUser();
  const course = await getCourseById(id);

  if (!course || !canManageCourse(u.id, u.role as Role, course.instructorId)) {
    notFound();
  }

  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{course.title}</h1>
        <div className="flex items-center gap-3">
          <Link
            href={`/instructor/cursos/${course.id}/sesiones`}
            className="text-sm text-primary hover:underline"
          >
            Sesiones de clase
          </Link>
          <PublishButton courseId={course.id} status={course.status} />
        </div>
      </div>

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
          estimatedHours: course.estimatedHours,
        }}
      />
    </div>
  );
}
