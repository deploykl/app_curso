import { and, asc, count, countDistinct, eq, gt, ilike, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  courses,
  categories,
  certificates,
  classSessions,
  enrollments,
  instructorProfiles,
  user,
} from "@/db/schema";

export interface CourseRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: "basico" | "intermedio" | "avanzado";
  deliveryMode: "en_vivo" | "grabado";
  categoryName: string | null;
  status: "draft" | "published" | "archived";
  priceCents: number;
  sessionCount: number;
  enrolledCount: number;
}

export async function listInstructorCourses(instructorId: string): Promise<CourseRow[]> {
  const rows = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      subtitle: courses.subtitle,
      level: courses.level,
      deliveryMode: courses.deliveryMode,
      categoryName: categories.name,
      status: courses.status,
      priceCents: courses.priceCents,
      sessionCount: countDistinct(classSessions.id),
      enrolledCount: countDistinct(
        sql`case when ${enrollments.status} = 'active' then ${enrollments.id} end`
      ),
    })
    .from(courses)
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .leftJoin(classSessions, eq(classSessions.courseId, courses.id))
    .leftJoin(enrollments, eq(enrollments.courseId, courses.id))
    .where(eq(courses.instructorId, instructorId))
    .groupBy(courses.id, categories.name)
    .orderBy(courses.createdAt);

  return rows.map((r) => ({
    ...r,
    sessionCount: Number(r.sessionCount),
    enrolledCount: Number(r.enrolledCount),
  }));
}

export async function getCourseById(courseId: string) {
  const [c] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return c ?? null;
}

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  level: string;
  deliveryMode: "en_vivo" | "grabado";
  priceCents: number;
  instructorName: string;
  categoryName: string | null;
  sessionCount: number;
}

export interface PublicSession {
  id: string;
  orderIndex: number;
  title: string;
  descriptionMd: string | null;
  startsAt: Date | null;
  durationMinutes: number;
  isFreePreview: boolean;
  hasRecording: boolean;
}

export interface PublicCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  descriptionMd: string | null;
  coverUrl: string | null;
  level: string;
  deliveryMode: "en_vivo" | "grabado";
  priceCents: number;
  estimatedHours: string | null;
  instructorName: string;
  instructorHeadline: string | null;
  instructorBioMd: string | null;
  categoryName: string | null;
  sessions: PublicSession[];
}

export async function listPublishedCourses(filter: {
  categorySlug?: string;
  level?: "basico" | "intermedio" | "avanzado";
  q?: string;
}): Promise<CourseCard[]> {
  const conditions = [eq(courses.status, "published")];
  if (filter.categorySlug) conditions.push(eq(categories.slug, filter.categorySlug));
  if (filter.level) conditions.push(eq(courses.level, filter.level));
  if (filter.q) conditions.push(ilike(courses.title, `%${filter.q}%`));

  const rows = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      subtitle: courses.subtitle,
      coverUrl: courses.coverUrl,
      level: courses.level,
      deliveryMode: courses.deliveryMode,
      priceCents: courses.priceCents,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      categoryName: categories.name,
      sessionCount: sql<number>`(
        select count(*) from ${classSessions} where ${classSessions.courseId} = ${courses.id}
      )`,
    })
    .from(courses)
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(and(...conditions))
    .orderBy(asc(courses.title));

  return rows.map((r) => ({ ...r, sessionCount: Number(r.sessionCount) }));
}

export interface LandingStats {
  students: number;
  courses: number;
  certificates: number;
}

/**
 * Cifras reales para la banda de social proof del landing.
 * El componente decide cuáles mostrar comparándolas con STATS_FLOOR.
 */
export async function getLandingStats(): Promise<LandingStats> {
  const [students, published, issued] = await Promise.all([
    db
      .select({ value: countDistinct(enrollments.userId) })
      .from(enrollments)
      .where(eq(enrollments.status, "active")),
    db.select({ value: count() }).from(courses).where(eq(courses.status, "published")),
    db.select({ value: count() }).from(certificates).where(isNull(certificates.revokedAt)),
  ]);

  return {
    students: Number(students[0]?.value ?? 0),
    courses: Number(published[0]?.value ?? 0),
    certificates: Number(issued[0]?.value ?? 0),
  };
}

export interface NextLiveSession {
  courseSlug: string;
  courseTitle: string;
  sessionTitle: string;
  startsAt: Date;
  durationMinutes: number;
  instructorName: string;
}

/**
 * La próxima clase en vivo (de cualquier curso publicado) que todavía no
 * terminó — alimenta la vitrina "próxima clase en vivo" del hero: es la
 * prueba más concreta de que "en vivo" no es solo un rótulo.
 */
export async function getNextLiveSession(): Promise<NextLiveSession | null> {
  const [row] = await db
    .select({
      courseSlug: courses.slug,
      courseTitle: courses.title,
      sessionTitle: classSessions.title,
      startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
    })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(
      and(
        eq(courses.status, "published"),
        eq(courses.deliveryMode, "en_vivo"),
        gt(
          sql`${classSessions.startsAt} + (${classSessions.durationMinutes} || ' minutes')::interval`,
          sql`now()`
        )
      )
    )
    .orderBy(asc(classSessions.startsAt))
    .limit(1);

  // El where garantiza startsAt no nulo (se compara contra now()); el tipo
  // de columna es nullable porque los cursos grabados no la usan.
  return row ? { ...row, startsAt: row.startsAt! } : null;
}

export async function getPublicCourse(slug: string): Promise<PublicCourse | null> {
  const [c] = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      subtitle: courses.subtitle,
      descriptionMd: courses.descriptionMd,
      coverUrl: courses.coverUrl,
      level: courses.level,
      deliveryMode: courses.deliveryMode,
      priceCents: courses.priceCents,
      estimatedHours: courses.estimatedHours,
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${user.name})`,
      instructorHeadline: instructorProfiles.headline,
      instructorBioMd: instructorProfiles.bioMd,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(user, eq(user.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .leftJoin(categories, eq(categories.id, courses.categoryId))
    .where(and(eq(courses.slug, slug), eq(courses.status, "published")))
    .limit(1);

  if (!c) return null;

  // Columnas listadas UNA POR UNA a propósito: zoomUrl y recordingUrl
  // no deben salir nunca de aquí. Nunca uses select() sin argumentos.
  const sessions = await db
    .select({
      id: classSessions.id,
      orderIndex: classSessions.orderIndex,
      title: classSessions.title,
      descriptionMd: classSessions.descriptionMd,
      startsAt: classSessions.startsAt,
      durationMinutes: classSessions.durationMinutes,
      isFreePreview: classSessions.isFreePreview,
      hasRecording: sql<boolean>`${classSessions.recordingUrl} is not null or ${classSessions.videoFileKey} is not null`,
    })
    .from(classSessions)
    .where(eq(classSessions.courseId, c.id))
    .orderBy(asc(classSessions.orderIndex));

  return { ...c, sessions };
}
