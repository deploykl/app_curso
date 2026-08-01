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
  if (!prof?.displayName) {
    throw new Error(
      "El instructor no tiene un perfil configurado; no se puede emitir el certificado."
    );
  }

  // drizzle-orm (postgres-js) envuelve el error del driver en un
  // DrizzleQueryError y expone el original en `.cause` (ver pg-core/session.ts),
  // así que el código SQLSTATE puede venir en `err.code` o en `err.cause.code`
  // según de dónde se origine el fallo. Mismo patrón que en
  // assessment/actions.ts.
  const codigoSqlstate = (candidate: unknown): string | undefined =>
    candidate && typeof candidate === "object" && "code" in candidate
      ? (candidate as { code?: unknown }).code as string | undefined
      : undefined;
  const nombreConstraint = (candidate: unknown): string | undefined =>
    candidate && typeof candidate === "object" && "constraint_name" in candidate
      ? (candidate as { constraint_name?: unknown }).constraint_name as string | undefined
      : undefined;
  const esColisionDeCodigo = (err: unknown): boolean => {
    const cause = (err as { cause?: unknown } | undefined)?.cause;
    const codigo = codigoSqlstate(err) ?? codigoSqlstate(cause);
    if (codigo !== "23505") return false;
    const constraint = nombreConstraint(err) ?? nombreConstraint(cause);
    // Si el driver no expone el nombre de constraint, nos quedamos con el
    // código 23505 (el único UNIQUE que puede chocar aquí, aparte del de
    // `enrollment_id` cubierto por `onConflictDoNothing`, es el de `code`).
    return constraint === undefined || constraint === "certificates_code_unique";
  };

  // Postgres aborta la transacción completa ante cualquier error de statement;
  // un reintento de `tx.insert` dentro de la misma tx fallaría de inmediato con
  // 25P02. Por eso el INSERT propenso a colisión se envuelve en una
  // sub-transacción de Drizzle (`tx.transaction(...)`), que para el driver
  // postgres-js se traduce en un SAVEPOINT real (ver
  // drizzle-orm/postgres-js/session.js: `client.savepoint(...)`). Si choca,
  // Drizzle hace ROLLBACK TO SAVEPOINT automáticamente al propagar el error y
  // la `tx` externa sigue viva para reintentar con un código nuevo.
  const MAX_REINTENTOS = 5;
  for (let intento = 0; intento < MAX_REINTENTOS; intento++) {
    const code = generarCodigo();
    try {
      await tx.transaction(async (tx2) => {
        await tx2
          .insert(certificates)
          .values({
            enrollmentId,
            code,
            studentName: datos.studentName,
            courseTitle: datos.courseTitle,
            instructorName: prof.displayName,
            academyName: env.ACADEMIA_NAME,
            hours: datos.hours,
            finalScore: scorePct.toFixed(2),
          })
          .onConflictDoNothing({ target: certificates.enrollmentId });
      });
      return;
    } catch (err) {
      if (!esColisionDeCodigo(err)) throw err;
    }
  }
  throw new Error("No se pudo generar un código de certificado único.");
}
