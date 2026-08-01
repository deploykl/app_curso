import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { presignGet } from "@/lib/r2";
import { generarYSubirPdf } from "@/modules/certification/pdf";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const [cert] = await db
    .select()
    .from(certificates)
    .where(eq(certificates.code, code.toUpperCase()))
    .limit(1);

  if (!cert || cert.revokedAt) {
    return new Response("No encontrado.", { status: 404 });
  }

  let pdfKey = cert.pdfKey;
  if (!pdfKey) {
    try {
      pdfKey = await generarYSubirPdf({
        code: cert.code,
        studentName: cert.studentName,
        courseTitle: cert.courseTitle,
        instructorName: cert.instructorName,
        academyName: cert.academyName,
        hours: cert.hours === null ? null : Number(cert.hours),
        finalScore: Number(cert.finalScore),
        issuedAt: cert.issuedAt,
      });
      await db.update(certificates).set({ pdfKey }).where(eq(certificates.id, cert.id));
    } catch (err) {
      console.error("Error sirviendo el PDF del certificado:", code, err);
      return new Response("Error al generar el certificado.", { status: 500 });
    }
  }

  const url = await presignGet(pdfKey);
  return Response.redirect(url, 302);
}
