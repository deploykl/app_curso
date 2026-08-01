"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { classSessions, courses, enrollments, sessionAttendance } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { assertEnrolled } from "@/modules/auth/guards";

export async function marcarProgreso(sessionId: string): Promise<void> {
  const u = await requireUser();

  const [row] = await db
    .select({ courseId: classSessions.courseId, courseSlug: courses.slug })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!row) throw new Error("Sesión no encontrada.");

  await assertEnrolled(u.id, row.courseId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, u.id), eq(enrollments.courseId, row.courseId), eq(enrollments.status, "active")))
    .limit(1);
  if (!enrollment) throw new Error("Inscripción no encontrada.");

  await db.insert(sessionAttendance)
    .values({ enrollmentId: enrollment.id, classSessionId: sessionId })
    .onConflictDoNothing({ target: [sessionAttendance.enrollmentId, sessionAttendance.classSessionId] });

  revalidatePath(`/curso/${row.courseSlug}/aprender/${sessionId}`);
  revalidatePath(`/curso/${row.courseSlug}/aprender`);
  revalidatePath("/mi-aprendizaje");
}
