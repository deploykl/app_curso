import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, classSessions } from "@/db/schema";

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published" | "archived";
  priceCents: number;
  sessionCount: number;
}

export async function listInstructorCourses(instructorId: string): Promise<CourseRow[]> {
  const rows = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      status: courses.status,
      priceCents: courses.priceCents,
      sessionCount: count(classSessions.id),
    })
    .from(courses)
    .leftJoin(classSessions, eq(classSessions.courseId, courses.id))
    .where(eq(courses.instructorId, instructorId))
    .groupBy(courses.id)
    .orderBy(courses.createdAt);

  return rows.map((r) => ({ ...r, sessionCount: Number(r.sessionCount) }));
}

export async function getCourseById(courseId: string) {
  const [c] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return c ?? null;
}
