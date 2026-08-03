import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, classSessions, enrollments, sessionAttendance, sessionMaterials, exams, categories } from "@/db/schema";
import { assertEnrolled } from "@/modules/auth/guards";
import { sessionState, type SessionState } from "@/lib/datetime";
import { pickNextSession } from "./service";

/** Sesiones "grabado" no tienen fecha: se consideran siempre disponibles, como si ya hubieran pasado. */
function effectiveState(startsAt: Date | null, durationMinutes: number): SessionState {
  return startsAt ? sessionState(startsAt, durationMinutes) : "past";
}

export interface MyCourseCard {
  courseId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  categoryName: string | null;
  deliveryMode: "en_vivo" | "grabado";
  totalSessions: number;
  attendedSessions: number;
  nextSession: { id: string; title: string; startsAt: Date; state: SessionState } | null;
}

export async function listMyCourses(userId: string): Promise<MyCourseCard[]> {
  const myEnrollments = await db
    .select({
      enrollmentId: enrollments.id,
      courseId: enrollments.courseId,
      slug: courses.slug,
      title: courses.title,
      subtitle: courses.subtitle,
      categoryName: categories.name,
      deliveryMode: courses.deliveryMode,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, "active")))
    .orderBy(asc(courses.title));

  const result: MyCourseCard[] = [];
  for (const e of myEnrollments) {
    const sessions = await db
      .select({
        id: classSessions.id, title: classSessions.title,
        startsAt: classSessions.startsAt, durationMinutes: classSessions.durationMinutes,
      })
      .from(classSessions)
      .where(eq(classSessions.courseId, e.courseId))
      .orderBy(asc(classSessions.startsAt));

    const attendedRows = await db
      .select({ classSessionId: sessionAttendance.classSessionId })
      .from(sessionAttendance)
      .where(eq(sessionAttendance.enrollmentId, e.enrollmentId));

    // pickNextSession solo tiene sentido para cursos en vivo: los grabados no tienen fecha.
    const withDate = sessions.filter((s): s is typeof s & { startsAt: Date } => s.startsAt !== null);
    const next = pickNextSession(withDate);
    result.push({
      courseId: e.courseId,
      slug: e.slug,
      title: e.title,
      subtitle: e.subtitle,
      categoryName: e.categoryName,
      deliveryMode: e.deliveryMode,
      totalSessions: sessions.length,
      attendedSessions: attendedRows.length,
      nextSession: next
        ? { id: next.id, title: next.title, startsAt: next.startsAt, state: sessionState(next.startsAt, next.durationMinutes) }
        : null,
    });
  }
  return result;
}

export interface AgendaSession {
  id: string;
  orderIndex: number;
  title: string;
  startsAt: Date | null;
  durationMinutes: number;
  state: SessionState;
  hasRecording: boolean;
  materialCount: number;
  attended: boolean;
}

export interface CourseAgenda {
  courseId: string;
  slug: string;
  title: string;
  deliveryMode: "en_vivo" | "grabado";
  tieneExamenPublicado: boolean;
  sessions: AgendaSession[];
}

export async function getCourseAgenda(userId: string, slug: string): Promise<CourseAgenda | null> {
  const [course] = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title, deliveryMode: courses.deliveryMode })
    .from(courses).where(eq(courses.slug, slug)).limit(1);
  if (!course) return null;

  await assertEnrolled(userId, course.id);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, course.id), eq(enrollments.status, "active")))
    .limit(1);

  const rawSessions = await db
    .select({
      id: classSessions.id, orderIndex: classSessions.orderIndex, title: classSessions.title,
      startsAt: classSessions.startsAt, durationMinutes: classSessions.durationMinutes,
      hasRecording: sql<boolean>`${classSessions.recordingUrl} is not null or ${classSessions.videoFileKey} is not null`,
    })
    .from(classSessions)
    .where(eq(classSessions.courseId, course.id))
    .orderBy(asc(classSessions.orderIndex));

  const attendedRows = enrollment
    ? await db.select({ classSessionId: sessionAttendance.classSessionId })
        .from(sessionAttendance).where(eq(sessionAttendance.enrollmentId, enrollment.id))
    : [];
  const attendedIds = new Set(attendedRows.map((r) => r.classSessionId));

  const sessionIds = rawSessions.map((s) => s.id);
  const materialRows = sessionIds.length > 0
    ? await db.select({ classSessionId: sessionMaterials.classSessionId })
        .from(sessionMaterials).where(inArray(sessionMaterials.classSessionId, sessionIds))
    : [];
  const materialCounts = new Map<string, number>();
  for (const m of materialRows) {
    materialCounts.set(m.classSessionId, (materialCounts.get(m.classSessionId) ?? 0) + 1);
  }

  const examenPublicado = await db
    .select({ id: exams.id })
    .from(exams)
    .where(and(eq(exams.courseId, course.id), eq(exams.isPublished, true)))
    .limit(1);

  return {
    courseId: course.id,
    slug: course.slug,
    title: course.title,
    deliveryMode: course.deliveryMode,
    tieneExamenPublicado: examenPublicado.length > 0,
    sessions: rawSessions.map((s) => ({
      ...s,
      materialCount: materialCounts.get(s.id) ?? 0,
      state: effectiveState(s.startsAt, s.durationMinutes),
      attended: attendedIds.has(s.id),
    })),
  };
}

export interface SessionDetail {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  deliveryMode: "en_vivo" | "grabado";
  title: string;
  descriptionMd: string | null;
  startsAt: Date | null;
  durationMinutes: number;
  state: SessionState;
  zoomUrl: string | null;
  recordingUrl: string | null;
  videoFileKey: string | null;
  attended: boolean;
  materials: { id: string; title: string }[];
  tieneExamenPublicado: boolean;
}

export async function getSessionDetail(userId: string, sessionId: string): Promise<SessionDetail | null> {
  const [row] = await db
    .select({
      id: classSessions.id, courseId: classSessions.courseId, title: classSessions.title,
      descriptionMd: classSessions.descriptionMd, startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      zoomUrl: classSessions.zoomUrl, recordingUrl: classSessions.recordingUrl,
      videoFileKey: classSessions.videoFileKey,
      courseTitle: courses.title, courseSlug: courses.slug, deliveryMode: courses.deliveryMode,
    })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  await assertEnrolled(userId, row.courseId);

  const [enrollment] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.courseId, row.courseId), eq(enrollments.status, "active")))
    .limit(1);

  const attended = enrollment
    ? (await db.select({ id: sessionAttendance.id }).from(sessionAttendance)
        .where(and(eq(sessionAttendance.enrollmentId, enrollment.id), eq(sessionAttendance.classSessionId, sessionId)))
        .limit(1)).length > 0
    : false;

  const materials = await db
    .select({ id: sessionMaterials.id, title: sessionMaterials.title })
    .from(sessionMaterials)
    .where(eq(sessionMaterials.classSessionId, sessionId));

  const examenPublicado = await db
    .select({ id: exams.id })
    .from(exams)
    .where(and(eq(exams.courseId, row.courseId), eq(exams.isPublished, true)))
    .limit(1);

  return {
    ...row,
    state: effectiveState(row.startsAt, row.durationMinutes),
    attended,
    materials,
    tieneExamenPublicado: examenPublicado.length > 0,
  };
}
