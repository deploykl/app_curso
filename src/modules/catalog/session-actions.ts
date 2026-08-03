"use server";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
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

/** Horas estimadas = suma de la duración de todas las sesiones. Se recalcula solo, nunca se pide al instructor. */
async function recalcEstimatedHours(courseId: string) {
  const [{ totalMinutes }] = await db
    .select({ totalMinutes: sql<number>`coalesce(sum(${classSessions.durationMinutes}), 0)` })
    .from(classSessions)
    .where(eq(classSessions.courseId, courseId));

  await db.update(courses)
    .set({ estimatedHours: (Number(totalMinutes) / 60).toFixed(2) })
    .where(eq(courses.id, courseId));
}

export async function createClassSession(courseId: string, raw: unknown) {
  const course = await assertOwnsCourse(courseId);
  const input = classSessionInputSchema.parse({ ...(raw as object), deliveryMode: course.deliveryMode });

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${classSessions.orderIndex}), -1) + 1` })
    .from(classSessions).where(eq(classSessions.courseId, courseId));

  let created: { id: string };
  if (input.deliveryMode === "en_vivo") {
    [created] = await db.insert(classSessions).values({
      courseId,
      orderIndex: Number(next),
      title: `Clase ${Number(next) + 1}`,
      descriptionMd: input.descriptionMd ?? null,
      startsAt: limaLocalToUtc(input.startsAtLocal),
      durationMinutes: input.durationMinutes,
      zoomUrl: input.zoomUrl || null,
      isFreePreview: input.isFreePreview,
    }).returning({ id: classSessions.id });
  } else {
    [created] = await db.insert(classSessions).values({
      courseId,
      orderIndex: Number(next),
      title: `Clase ${Number(next) + 1}`,
      descriptionMd: input.descriptionMd ?? null,
      startsAt: null,
      durationMinutes: input.durationMinutes,
      videoFileKey: input.videoFileKey ?? null,
      status: input.videoFileKey ? "completed" : "scheduled",
      isFreePreview: input.isFreePreview,
    }).returning({ id: classSessions.id });
  }
  await recalcEstimatedHours(courseId);

  revalidatePath(`/instructor/cursos/${courseId}`);
  return created;
}

/*
  Sube el video desde "Detalles del curso" (no desde "Sesiones"). Un curso
  grabado siempre tiene un video "principal": si todavía no existe ninguna
  sesión, se crea la primera acá mismo; si ya existe, se actualiza esa.
*/
const courseVideoInputSchema = z.object({
  videoFileKey: z.string().trim().min(1),
  durationMinutes: z.coerce.number().int().min(1).max(480),
});

export async function attachCourseVideo(courseId: string, raw: unknown) {
  const course = await assertOwnsCourse(courseId);
  if (course.deliveryMode !== "grabado") {
    throw new Error("Este curso no es de tipo grabado.");
  }
  const input = courseVideoInputSchema.parse(raw);

  const [first] = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(eq(classSessions.courseId, courseId))
    .orderBy(asc(classSessions.orderIndex))
    .limit(1);

  if (first) {
    await db.update(classSessions).set({
      videoFileKey: input.videoFileKey,
      durationMinutes: input.durationMinutes,
      status: "completed",
      updatedAt: new Date(),
    }).where(eq(classSessions.id, first.id));
  } else {
    await db.insert(classSessions).values({
      courseId,
      orderIndex: 0,
      title: "Clase 1",
      startsAt: null,
      durationMinutes: input.durationMinutes,
      videoFileKey: input.videoFileKey,
      status: "completed",
    });
  }
  await recalcEstimatedHours(courseId);

  revalidatePath(`/instructor/cursos/${courseId}`);
}

export async function updateClassSession(sessionId: string, raw: unknown) {
  const { course } = await assertOwnsSession(sessionId);
  const input = classSessionInputSchema.parse({ ...(raw as object), deliveryMode: course.deliveryMode });

  if (input.deliveryMode === "en_vivo") {
    await db.update(classSessions).set({
      descriptionMd: input.descriptionMd ?? null,
      startsAt: limaLocalToUtc(input.startsAtLocal),
      durationMinutes: input.durationMinutes,
      zoomUrl: input.zoomUrl || null,
      isFreePreview: input.isFreePreview,
      updatedAt: new Date(),
    }).where(eq(classSessions.id, sessionId));
  } else {
    await db.update(classSessions).set({
      descriptionMd: input.descriptionMd ?? null,
      durationMinutes: input.durationMinutes,
      ...(input.videoFileKey ? { videoFileKey: input.videoFileKey, status: "completed" as const } : {}),
      isFreePreview: input.isFreePreview,
      updatedAt: new Date(),
    }).where(eq(classSessions.id, sessionId));
  }
  await recalcEstimatedHours(course.id);

  revalidatePath(`/instructor/cursos/${course.id}`);
}

export async function setRecordingUrl(sessionId: string, url: string) {
  const { course } = await assertOwnsSession(sessionId);
  if (course.deliveryMode !== "en_vivo") {
    throw new Error("Este curso es grabado: sube el video directamente en la sesión.");
  }
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

  revalidatePath(`/instructor/cursos/${course.id}`);
}

export async function deleteClassSession(sessionId: string) {
  const { session, course } = await assertOwnsSession(sessionId);
  await db.delete(classSessions).where(eq(classSessions.id, sessionId));
  if (session.videoFileKey) {
    const { deleteObject } = await import("@/lib/r2");
    await deleteObject(session.videoFileKey).catch(() => {});
  }
  await recalcEstimatedHours(course.id);
  revalidatePath(`/instructor/cursos/${course.id}`);
}

export async function reorderClassSessions(courseId: string, orderedIds: string[]) {
  await assertOwnsCourse(courseId);
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(classSessions).set({ orderIndex: i })
        .where(eq(classSessions.id, id));
    }
  });
  revalidatePath(`/instructor/cursos/${courseId}`);
}
