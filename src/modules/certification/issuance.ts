// Sin "use server" a propósito: lo invoca cerrarIntento (grading.ts) dentro de
// SU transacción. No es un endpoint.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates, enrollments, courses, user, instructorProfiles } from "@/db/schema";
import { env } from "@/env";
import { generarCodigo } from "./service";

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Crea el certificado de un intento aprobado, dentro de la MISMA transacción
 * que cierra el intento (recibe `tx`, no abre una propia). Idempotente:
 * `ON CONFLICT (enrollment_id) DO NOTHING`. El código se reintenta si choca
 * con uno ya existente (colisión de UNIQUE en `code`).
 */
export async function emitirCertificado(
  tx: Transaccion,
  enrollmentId: string,
  scorePct: number
): Promise<void> {
  const [datos] = await tx
    .select({
      studentName: user.name,
      courseTitle: courses.title,
      hours: courses.estimatedHours,
      instructorId: courses.instructorId,
    })
    .from(enrollments)
    .innerJoin(user, eq(user.id, enrollments.userId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
  if (!datos) throw new Error("Inscripción no encontrada al emitir el certificado.");

  const [prof] = await tx
    .select({ displayName: instructorProfiles.displayName })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.userId, datos.instructorId))
    .limit(1);

  const MAX_REINTENTOS = 5;
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const code = generarCodigo();
    try {
      await tx
        .insert(certificates)
        .values({
          enrollmentId,
          code,
          studentName: datos.studentName,
          courseTitle: datos.courseTitle,
          instructorName: prof?.displayName ?? "",
          academyName: env.ACADEMIA_NAME,
          hours: datos.hours,
          finalScore: scorePct.toFixed(2),
        })
        .onConflictDoNothing({ target: certificates.enrollmentId });
      return;
    } catch (err) {
      // Colisión en `code` (distinto UNIQUE del que protege la idempotencia):
      // reintenta con un código nuevo. Cualquier otro error se relanza.
      const esColisionDeCodigo =
        err && typeof err === "object" && "code" in err && err.code === "23505" &&
        "constraint_name" in err && err.constraint_name === "certificates_code_unique";
      if (!esColisionDeCodigo) throw err;
    }
  }
  throw new Error("No se pudo generar un código de certificado único.");
}
