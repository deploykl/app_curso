import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, classSessions, enrollments, sessionAttendance, sessionMaterials } from "@/db/schema";
import { assertEnrolled } from "@/modules/auth/guards";
import { sessionState, type SessionState } from "@/lib/datetime";
import { pickNextSession } from "./service";

export interface MyCourseCard {
  courseId: string;
  slug: string;
  title: string;
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
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
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

    const next = pickNextSession(sessions);
    result.push({
      courseId: e.courseId,
      slug: e.slug,
      title: e.title,
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
  startsAt: Date;
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
  sessions: AgendaSession[];
}

export async function getCourseAgenda(userId: string, slug: string): Promise<CourseAgenda | null> {
  const [course] = await db
    .select({ id: courses.id, slug: courses.slug, title: courses.title })
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
      hasRecording: sql<boolean>`${classSessions.recordingUrl} is not null`,
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

  return {
    courseId: course.id,
    slug: course.slug,
    title: course.title,
    sessions: rawSessions.map((s) => ({
      ...s,
      materialCount: materialCounts.get(s.id) ?? 0,
      state: sessionState(s.startsAt, s.durationMinutes),
      attended: attendedIds.has(s.id),
    })),
  };
}

export interface SessionDetail {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  title: string;
  descriptionMd: string | null;
  startsAt: Date;
  durationMinutes: number;
  state: SessionState;
  zoomUrl: string | null;
  recordingUrl: string | null;
  attended: boolean;
  materials: { id: string; title: string }[];
}

export async function getSessionDetail(userId: string, sessionId: string): Promise<SessionDetail | null> {
  const [row] = await db
    .select({
      id: classSessions.id, courseId: classSessions.courseId, title: classSessions.title,
      descriptionMd: classSessions.descriptionMd, startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      zoomUrl: classSessions.zoomUrl, recordingUrl: classSessions.recordingUrl,
      courseTitle: courses.title, courseSlug: courses.slug,
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

  return { ...row, state: sessionState(row.startsAt, row.durationMinutes), attended, materials };
}
