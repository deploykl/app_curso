import { eq } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, courses } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { canManageCourse, type Role } from "@/modules/auth/guards";
import { validateVideoUpload, sessionVideoKey } from "@/modules/catalog/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  const u = await assertRole(["instructor", "admin"]);
  const body = (await req.json()) as {
    sessionId?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.sessionId || !body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const [s] = await db
    .select({ courseId: classSessions.courseId, instructorId: courses.instructorId, deliveryMode: courses.deliveryMode })
    .from(classSessions)
    .innerJoin(courses, eq(courses.id, classSessions.courseId))
    .where(eq(classSessions.id, body.sessionId))
    .limit(1);

  if (!s) return Response.json({ error: "Sesión no encontrada." }, { status: 404 });
  if (!canManageCourse(u.id, u.role as Role, s.instructorId)) {
    return Response.json({ error: "Sin permiso." }, { status: 403 });
  }
  if (s.deliveryMode !== "grabado") {
    return Response.json({ error: "Este curso no es de tipo grabado." }, { status: 400 });
  }

  const check = validateVideoUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = sessionVideoKey(body.sessionId, body.fileName);
  // Videos pueden pesar hasta 1 GB: más tiempo que el default para que la subida no expire a medio camino.
  const url = await presignPut(key, body.mimeType, 3600);
  return Response.json({ url, key });
}
