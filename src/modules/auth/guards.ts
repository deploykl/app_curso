import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollments } from "@/db/schema";

export type Role = "student" | "instructor" | "admin";

export class ForbiddenError extends Error {}

export async function isEnrolled(userId: string, courseId: string): Promise<boolean> {
  const rows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(
      eq(enrollments.userId, userId),
      eq(enrollments.courseId, courseId),
      eq(enrollments.status, "active"),
    ))
    .limit(1);
  return rows.length === 1;
}

export async function assertEnrolled(userId: string, courseId: string): Promise<void> {
  if (!(await isEnrolled(userId, courseId))) {
    throw new ForbiddenError("El usuario no está inscrito en este curso.");
  }
}

export function canManageCourse(
  userId: string,
  role: Role,
  courseInstructorId: string
): boolean {
  if (role === "admin") return true;
  if (role === "instructor") return userId === courseInstructorId;
  return false;
}
