import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, type Role } from "@/modules/auth/guards";
import { validateVideoUpload, courseVideoKey } from "@/modules/catalog/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  const u = await assertRole(["instructor", "admin"]);
  const body = (await req.json()) as {
    courseId?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.courseId || !body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const [c] = await db
    .select({ instructorId: courses.instructorId, deliveryMode: courses.deliveryMode })
    .from(courses)
    .where(eq(courses.id, body.courseId))
    .limit(1);

  if (!c) return Response.json({ error: "Curso no encontrado." }, { status: 404 });
  if (!canManageCourse(u.id, u.role as Role, c.instructorId)) {
    return Response.json({ error: "Sin permiso." }, { status: 403 });
  }
  if (c.deliveryMode !== "grabado") {
    return Response.json({ error: "Este curso no es de tipo grabado." }, { status: 400 });
  }

  const check = validateVideoUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = courseVideoKey(body.courseId, body.fileName);
  // Videos pueden pesar hasta 1 GB: más tiempo que el default para que la subida no expire a medio camino.
  const url = await presignPut(key, body.mimeType, 3600);
  return Response.json({ url, key });
}
