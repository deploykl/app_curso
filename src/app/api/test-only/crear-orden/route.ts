import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { crearOrden } from "@/modules/billing/actions";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "No disponible." }, { status: 404 });
  }
  const { courseSlug } = (await req.json()) as { courseSlug: string };
  const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, courseSlug)).limit(1);
  if (!course) return Response.json({ error: "Curso no encontrado." }, { status: 404 });
  const result = await crearOrden(course.id);
  return Response.json(result);
}
