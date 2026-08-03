import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { certificates, enrollments, courses } from "@/db/schema";

export type CertificadoPublico =
  | {
      estado: "valido";
      studentName: string;
      courseTitle: string;
      instructorName: string;
      academyName: string;
      hours: number | null;
      finalScore: number;
      issuedAt: Date;
    }
  | { estado: "revocado"; revokedAt: Date }
  | { estado: "pendiente_pago" };

/**
 * Verificación pública por código. No selecciona email ni ninguna columna
 * fuera de lo que el certificado imprime — el código es la única credencial.
 */
export async function getCertificadoPublico(code: string): Promise<CertificadoPublico | null> {
  const [row] = await db
    .select({
      studentName: certificates.studentName,
      courseTitle: certificates.courseTitle,
      instructorName: certificates.instructorName,
      academyName: certificates.academyName,
      hours: certificates.hours,
      finalScore: certificates.finalScore,
      issuedAt: certificates.issuedAt,
      revokedAt: certificates.revokedAt,
      paidAt: certificates.paidAt,
    })
    .from(certificates)
    .where(eq(certificates.code, code))
    .limit(1);
  if (!row) return null;

  if (row.revokedAt) {
    return { estado: "revocado", revokedAt: row.revokedAt };
  }

  // Certificado emitido pero bloqueado hasta que se pague (curso con
  // certificatePriceCents > 0). No se filtra info del alumno en este estado.
  if (!row.paidAt) {
    return { estado: "pendiente_pago" };
  }

  return {
    estado: "valido",
    studentName: row.studentName,
    courseTitle: row.courseTitle,
    instructorName: row.instructorName,
    academyName: row.academyName,
    hours: row.hours === null ? null : Number(row.hours),
    finalScore: Number(row.finalScore),
    issuedAt: row.issuedAt,
  };
}

export interface CertificadoAdminRow {
  id: string;
  code: string;
  studentName: string;
  courseTitle: string;
  issuedAt: Date;
  revokedAt: Date | null;
}

/** Todos los certificados emitidos, para el panel del admin. */
export async function listarCertificados(): Promise<CertificadoAdminRow[]> {
  return db
    .select({
      id: certificates.id,
      code: certificates.code,
      studentName: certificates.studentName,
      courseTitle: certificates.courseTitle,
      issuedAt: certificates.issuedAt,
      revokedAt: certificates.revokedAt,
    })
    .from(certificates)
    .orderBy(desc(certificates.issuedAt));
}

export interface MiCertificado {
  code: string;
  courseId: string;
  courseTitle: string;
  issuedAt: Date;
  paidAt: Date | null;
  certificatePriceCents: number | null;
}

/** Certificados del alumno, para /certificados. */
export async function getMisCertificados(userId: string): Promise<MiCertificado[]> {
  const rows = await db
    .select({
      code: certificates.code,
      courseId: enrollments.courseId,
      courseTitle: certificates.courseTitle,
      issuedAt: certificates.issuedAt,
      paidAt: certificates.paidAt,
      certificatePriceCents: courses.certificatePriceCents,
    })
    .from(certificates)
    .innerJoin(enrollments, eq(enrollments.id, certificates.enrollmentId))
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(and(eq(enrollments.userId, userId), isNull(certificates.revokedAt)))
    .orderBy(desc(certificates.issuedAt));
  return rows;
}
