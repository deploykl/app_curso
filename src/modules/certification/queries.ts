import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates } from "@/db/schema";

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
  | { estado: "revocado"; revokedAt: Date; revokeReason: string | null };

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
      revokeReason: certificates.revokeReason,
    })
    .from(certificates)
    .where(eq(certificates.code, code))
    .limit(1);
  if (!row) return null;

  if (row.revokedAt) {
    return { estado: "revocado", revokedAt: row.revokedAt, revokeReason: row.revokeReason };
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
