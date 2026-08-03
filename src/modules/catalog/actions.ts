"use server";
import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courses, classSessions, enrollments, orderItems, coupons } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, ForbiddenError, type Role } from "@/modules/auth/guards";
import { solesToCents } from "@/lib/money";
import { slugify, uniqueSlug } from "@/lib/slug";
import { courseInputSchema, createCourseInputSchema, canPublish } from "./service";

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
  const input = createCourseInputSchema.parse(raw);

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
    certificatePriceCents: input.certificatePriceSoles ? solesToCents(input.certificatePriceSoles) : null,
    deliveryMode: input.deliveryMode,
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
    certificatePriceCents: input.certificatePriceSoles ? solesToCents(input.certificatePriceSoles) : null,
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

  const check = canPublish({ sessionCount: Number(sessionCount) });
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

/**
 * Borrado permanente. Solo si el curso nunca tuvo movimiento real (ni
 * inscripciones ni órdenes asociadas) — sesiones, materiales, objetivos y
 * requisitos caen solos por `onDelete: cascade`. Con alumnos u órdenes de por
 * medio hay historial de pagos/certificados que no se puede perder, así que
 * se rechaza el borrado.
 */
export async function deleteCourse(courseId: string) {
  const u = await assertRole(["instructor", "admin"]);
  await loadOwned(u.id, u.role as string, courseId);

  const [{ value: enrollmentCount }] = await db
    .select({ value: count() }).from(enrollments).where(eq(enrollments.courseId, courseId));
  if (Number(enrollmentCount) > 0) {
    throw new Error("No puedes eliminar un curso con alumnos inscritos.");
  }

  const [{ value: orderItemCount }] = await db
    .select({ value: count() }).from(orderItems).where(eq(orderItems.courseId, courseId));
  if (Number(orderItemCount) > 0) {
    throw new Error("No puedes eliminar un curso con órdenes de compra asociadas.");
  }

  await db.delete(coupons).where(eq(coupons.courseId, courseId));
  await db.delete(courses).where(eq(courses.id, courseId));

  revalidatePath("/instructor");
  revalidatePath("/cursos");
}
