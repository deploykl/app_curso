// Sin "use server" a propósito: lo invoca cerrarIntento (grading.ts) dentro de
// SU transacción. No es un endpoint.
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { certificates, enrollments, courses, user, instructorProfiles } from "@/db/schema";
import { env } from "@/env";
import { generarCodigo } from "./service";

// Segundo alias de `user`: la primera fila ya usa `user` para el alumno, así
// que el instructor necesita su propio alias para el join.
const instructorUser = alias(user, "instructor_user");

type Transaccion = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Crea el certificado de un intento aprobado, dentro de la MISMA transacción
 * que cierra el intento (recibe `tx`, no abre una propia). Idempotente:
 * `ON CONFLICT (enrollment_id)`. Si ya existe un certificado NO revocado para
 * esa inscripción, es un no-op (`DO UPDATE ... WHERE revoked_at IS NOT NULL`
 * hace que el UPDATE no se aplique cuando la fila existente sigue vigente).
 * Si el certificado existente SÍ está revocado (el alumno fue reembolsado y
 * recompró el curso — `enrollments` reutiliza la misma fila, ver fix de C2 en
 * billing/actions.ts), se reactiva con los datos de esta nueva emisión:
 * código nuevo, `revokedAt`/`revokeReason` a null y `pdfKey` a null para que
 * el PDF se regenere con los datos actuales en la próxima descarga. El código
 * se reintenta si choca con uno ya existente (colisión de UNIQUE en `code`).
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
      // El perfil del instructor es opcional en todo el repo (ver
      // catalog/queries.ts, billing/actions.ts): si no tiene fila en
      // `instructorProfiles`, o no tiene `displayName`, se cae al `name` de
      // su cuenta de usuario en vez de fallar. La emisión del certificado
      // nunca debe revertir el cierre del intento de examen (Fase 4) por un
      // perfil de instructor incompleto.
      instructorName: sql<string>`coalesce(${instructorProfiles.displayName}, ${instructorUser.name})`,
    })
    .from(enrollments)
    .innerJoin(user, eq(user.id, enrollments.userId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .innerJoin(instructorUser, eq(instructorUser.id, courses.instructorId))
    .leftJoin(instructorProfiles, eq(instructorProfiles.userId, courses.instructorId))
    .where(eq(enrollments.id, enrollmentId))
    .limit(1);
  if (!datos) throw new Error("Inscripción no encontrada al emitir el certificado.");

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
            instructorName: datos.instructorName,
            academyName: env.ACADEMIA_NAME,
            hours: datos.hours,
            finalScore: scorePct.toFixed(2),
          })
          .onConflictDoUpdate({
            target: certificates.enrollmentId,
            set: {
              code,
              issuedAt: new Date(),
              studentName: datos.studentName,
              courseTitle: datos.courseTitle,
              instructorName: datos.instructorName,
              academyName: env.ACADEMIA_NAME,
              hours: datos.hours,
              finalScore: scorePct.toFixed(2),
              pdfKey: null,
              revokedAt: null,
              revokeReason: null,
            },
            // Solo reactivamos si la fila existente está revocada. Si sigue
            // vigente (caso normal: no debería re-emitirse), la condición es
            // falsa y Postgres deja el DO UPDATE sin efecto (no-op), igual
            // que el DO NOTHING anterior.
            where: sql`${certificates.revokedAt} is not null`,
          });
      });
      return;
    } catch (err) {
      if (!esColisionDeCodigo(err)) throw err;
    }
  }
  throw new Error("No se pudo generar un código de certificado único.");
}

/**
 * Revoca el certificado de una inscripción dentro de una transacción dada
 * (no abre una propia). No toca R2 — el llamador debe borrar el `pdfKey`
 * devuelto de R2 DESPUÉS de que su transacción cierre. Idempotente: si no
 * hay certificado, o ya estaba revocado, devuelve `null` sin escribir.
 */
export async function revocarCertificadoTx(
  tx: Transaccion,
  enrollmentId: string,
  motivo: string
): Promise<{ pdfKey: string | null } | null> {
  const [cert] = await tx
    .select({ id: certificates.id, pdfKey: certificates.pdfKey, revokedAt: certificates.revokedAt })
    .from(certificates)
    .where(eq(certificates.enrollmentId, enrollmentId))
    .limit(1);
  if (!cert || cert.revokedAt) return null;

  await tx
    .update(certificates)
    .set({ revokedAt: new Date(), revokeReason: motivo.trim(), pdfKey: null })
    .where(eq(certificates.id, cert.id));

  return { pdfKey: cert.pdfKey };
}
