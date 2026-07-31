"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { classSessions, courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, ForbiddenError, type Role } from "@/modules/auth/guards";
import { classSessionInputSchema, limaLocalToUtc } from "./service";

async function assertOwnsCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) throw new ForbiddenError("Curso no encontrado.");
  if (!canManageCourse(u.id, u.role as Role, c.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return c;
}

async function assertOwnsSession(sessionId: string) {
  const [s] = await db.select().from(classSessions)
    .where(eq(classSessions.id, sessionId)).limit(1);
  if (!s) throw new ForbiddenError("Sesión no encontrada.");
  const c = await assertOwnsCourse(s.courseId);
  return { session: s, course: c };
}

export async function createClassSession(courseId: string, raw: unknown) {
  await assertOwnsCourse(courseId);
  const input = classSessionInputSchema.parse(raw);

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${classSessions.orderIndex}), -1) + 1` })
    .from(classSessions).where(eq(classSessions.courseId, courseId));

  await db.insert(classSessions).values({
    courseId,
    orderIndex: Number(next),
    title: input.title,
    descriptionMd: input.descriptionMd ?? null,
    startsAt: limaLocalToUtc(input.startsAtLocal),
    durationMinutes: input.durationMinutes,
    zoomUrl: input.zoomUrl || null,
    isFreePreview: input.isFreePreview,
  });

  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

export async function updateClassSession(sessionId: string, raw: unknown) {
  const { course } = await assertOwnsSession(sessionId);
  const input = classSessionInputSchema.parse(raw);

  await db.update(classSessions).set({
    title: input.title,
    descriptionMd: input.descriptionMd ?? null,
    startsAt: limaLocalToUtc(input.startsAtLocal),
    durationMinutes: input.durationMinutes,
    zoomUrl: input.zoomUrl || null,
    isFreePreview: input.isFreePreview,
    updatedAt: new Date(),
  }).where(eq(classSessions.id, sessionId));

  revalidatePath(`/instructor/cursos/${course.id}/sesiones`);
}

export async function setRecordingUrl(sessionId: string, url: string) {
  const { course } = await assertOwnsSession(sessionId);
  const clean = url.trim();
  if (clean && !/^https:\/\//.test(clean)) {
    throw new Error("El enlace de la grabación debe empezar con https://");
  }

  await db.update(classSessions).set({
    recordingUrl: clean || null,
    recordingAddedAt: clean ? new Date() : null,
    status: clean ? "completed" : "scheduled",
    updatedAt: new Date(),
  }).where(eq(classSessions.id, sessionId));

  revalidatePath(`/instructor/cursos/${course.id}/sesiones`);
}

export async function deleteClassSession(sessionId: string) {
  const { course } = await assertOwnsSession(sessionId);
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  revalidatePath(`/instructor/cursos/${course.id}/sesiones`);
}

export async function reorderClassSessions(courseId: string, orderedIds: string[]) {
  await assertOwnsCourse(courseId);
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(classSessions).set({ orderIndex: i })
        .where(eq(classSessions.id, id));
    }
  });
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}
