import { and, asc, count, eq, ilike, sql } from "drizzle-orm";
import { db } from "@/db";
import { courses, categories, classSessions, instructorProfiles, user } from "@/db/schema";

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

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  level: string;
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
  startsAt: Date;
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
      hasRecording: sql<boolean>`${classSessions.recordingUrl} is not null`,
    })
    .from(classSessions)
    .where(eq(classSessions.courseId, c.id))
    .orderBy(asc(classSessions.orderIndex));

  return { ...c, sessions };
}
