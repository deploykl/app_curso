"use server";
import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses, classSessions } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, ForbiddenError, type Role } from "@/modules/auth/guards";
import { solesToCents } from "@/lib/money";
import { slugify, uniqueSlug } from "@/lib/slug";
import { courseInputSchema, canPublish } from "./service";

async function slugExists(slug: string) {
  const rows = await db.select({ id: courses.id }).from(courses)
    .where(eq(courses.slug, slug)).limit(1);
  return rows.length > 0;
}

async function loadOwned(userId: string, role: string, courseId: string) {
  const [c] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!c) throw new ForbiddenError("Curso no encontrado.");
  if (!canManageCourse(userId, role as Role, c.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return c;
}

export async function createCourse(raw: unknown) {
  const u = await assertRole(["instructor", "admin"]);
  const input = courseInputSchema.parse(raw);

  const slug = await uniqueSlug(slugify(input.title), slugExists);

  const [created] = await db.insert(courses).values({
    instructorId: u.id,
    categoryId: input.categoryId ?? null,
    slug,
    title: input.title,
    subtitle: input.subtitle ?? null,
    descriptionMd: input.descriptionMd ?? null,
    level: input.level,
    priceCents: solesToCents(input.priceSoles),
    estimatedHours: input.estimatedHours?.toFixed(2) ?? null,
    status: "draft",
  }).returning({ id: courses.id, slug: courses.slug });

  revalidatePath("/instructor");
  return created;
}

export async function updateCourse(courseId: string, raw: unknown) {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwned(u.id, u.role as string, courseId);
  const input = courseInputSchema.parse(raw);

  await db.update(courses).set({
    categoryId: input.categoryId ?? null,
    title: input.title,
    subtitle: input.subtitle ?? null,
    descriptionMd: input.descriptionMd ?? null,
    level: input.level,
    priceCents: solesToCents(input.priceSoles),
    estimatedHours: input.estimatedHours?.toFixed(2) ?? null,
    updatedAt: new Date(),
  }).where(eq(courses.id, courseId));

  revalidatePath("/instructor");
  revalidatePath(`/instructor/cursos/${courseId}`);
}

export async function publishCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const c = await loadOwned(u.id, u.role as string, courseId);

  const [{ value: sessionCount }] = await db
    .select({ value: count() })
    .from(classSessions)
    .where(eq(classSessions.courseId, courseId));

  const check = canPublish({
    title: c.title,
    priceCents: c.priceCents,
    sessionCount: Number(sessionCount),
    estimatedHours: c.estimatedHours,
  });
  if (!check.ok) throw new Error(check.reason);

  await db.update(courses)
    .set({ status: "published", publishedAt: new Date(), updatedAt: new Date() })
    .where(eq(courses.id, courseId));

  revalidatePath("/cursos");
  revalidatePath(`/cursos/${c.slug}`);
  revalidatePath("/instructor");
}

export async function unpublishCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const c = await loadOwned(u.id, u.role as string, courseId);
  await db.update(courses).set({ status: "draft", updatedAt: new Date() })
    .where(eq(courses.id, courseId));
  revalidatePath("/cursos");
  revalidatePath(`/cursos/${c.slug}`);
}
