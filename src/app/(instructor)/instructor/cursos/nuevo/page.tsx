import { db } from "@/db";
import { categories } from "@/db/schema";
import { CourseForm } from "@/modules/catalog/ui/course-form";

export default async function NuevoCursoPage() {
  const cats = await db.select({ id: categories.id, name: categories.name }).from(categories);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Nuevo curso</h1>
      <CourseForm categories={cats} />
    </div>
  );
}
