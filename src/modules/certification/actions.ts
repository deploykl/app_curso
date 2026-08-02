"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { deleteObject } from "@/lib/r2";
import { revocarCertificadoTx } from "./issuance";

export async function revocarCertificado(certificateId: string, motivo: string): Promise<void> {
  await assertRole(["admin"]);

  if (!motivo.trim()) {
    throw new Error("Escribe el motivo de la revocación.");
  }

  const [cert] = await db.select({ id: certificates.id, enrollmentId: certificates.enrollmentId })
    .from(certificates).where(eq(certificates.id, certificateId)).limit(1);
  if (!cert) throw new Error("Certificado no encontrado.");

  const resultado = await db.transaction(async (tx) => {
    return revocarCertificadoTx(tx, cert.enrollmentId, motivo);
  });

  // Invalida el PDF ya subido a R2: si no lo borramos, una URL prefirmada
  // emitida antes de la revocación sigue sirviendo el PDF durante su tiempo
  // de vida, y el endpoint volvería a generarlo si el objeto siguiera
  // existiendo con `pdfKey` sin limpiar.
  if (resultado?.pdfKey) {
    try {
      await deleteObject(resultado.pdfKey);
    } catch (err) {
      console.error("Error borrando el PDF del certificado revocado:", resultado.pdfKey, err);
    }
  }

  revalidatePath("/admin/certificados");
}
