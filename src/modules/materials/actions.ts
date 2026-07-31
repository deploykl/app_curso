"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { sessionMaterials, classSessions, courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, assertEnrolled, ForbiddenError, type Role } from "@/modules/auth/guards";
import { presignGet, deleteObject } from "@/lib/r2";

const linkSchema = z.object({
  title: z.string().trim().min(1).max(160),
  externalUrl: z.string().url().startsWith("https://", "El enlace debe usar https."),
});

const fileSchema = z.object({
  title: z.string().trim().min(1).max(160),
  fileKey: z.string().trim().min(1),
  fileSize: z.coerce.number().int().positive(),
  mimeType: z.string().trim().min(1),
});

async function ownedSession(sessionId: string) {
  const u = await assertRole(["instructor", "admin"]);
  const [row] = await db
    .select({ courseId: classSessions.courseId, instructorId: courses.instructorId })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, sessionId))
    .limit(1);
  if (!row) throw new ForbiddenError("Sesión no encontrada.");
  if (!canManageCourse(u.id, u.role as Role, row.instructorId)) {
    throw new ForbiddenError("No puedes gestionar este curso.");
  }
  return row;
}

export async function addFileMaterial(sessionId: string, raw: unknown) {
  const { courseId } = await ownedSession(sessionId);
  const input = fileSchema.parse(raw);
  await db.insert(sessionMaterials).values({
    classSessionId: sessionId,
    title: input.title,
    fileKey: input.fileKey,
    externalUrl: null,
    fileSize: input.fileSize,
    mimeType: input.mimeType,
  });
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

export async function addLinkMaterial(sessionId: string, raw: unknown) {
  const { courseId } = await ownedSession(sessionId);
  const input = linkSchema.parse(raw);
  await db.insert(sessionMaterials).values({
    classSessionId: sessionId,
    title: input.title,
    fileKey: null,
    externalUrl: input.externalUrl,
  });
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

export async function deleteMaterial(materialId: string) {
  const [m] = await db.select().from(sessionMaterials)
    .where(eq(sessionMaterials.id, materialId)).limit(1);
  if (!m) throw new ForbiddenError("Material no encontrado.");
  const { courseId } = await ownedSession(m.classSessionId);

  await db.delete(sessionMaterials).where(eq(sessionMaterials.id, materialId));
  if (m.fileKey) {
    try { await deleteObject(m.fileKey); } catch { /* el registro ya se borró */ }
  }
  revalidatePath(`/instructor/cursos/${courseId}/sesiones`);
}

/** Devuelve una URL de descarga solo si el usuario está inscrito en el curso. */
export async function getMaterialDownloadUrl(userId: string, materialId: string): Promise<string> {
  const [m] = await db
    .select({
      fileKey: sessionMaterials.fileKey,
      externalUrl: sessionMaterials.externalUrl,
      courseId: classSessions.courseId,
    })
    .from(sessionMaterials)
    .innerJoin(classSessions, eq(classSessions.id, sessionMaterials.classSessionId))
    .where(eq(sessionMaterials.id, materialId))
    .limit(1);

  if (!m) throw new ForbiddenError("Material no encontrado.");
  await assertEnrolled(userId, m.courseId);

  if (m.externalUrl) return m.externalUrl;
  return presignGet(m.fileKey!);
}
