import { eq } from "drizzle-orm";
import { db } from "@/db";
import { certificates } from "@/db/schema";
import { presignGet } from "@/lib/r2";
import { generarYSubirPdf } from "@/modules/certification/pdf";

// Endpoint público sin autenticación que sirve el PDF de un certificado
// (nombre completo del alumno incluido): no debe ser indexado por buscadores.
const NOINDEX_HEADERS = { "X-Robots-Tag": "noindex" };

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
    return new Response("No encontrado.", { status: 404, headers: NOINDEX_HEADERS });
  }
  // Defensa en profundidad: la UI (/certificados) ya oculta este link mientras
  // el certificado está bloqueado (curso con certificado pago sin pagar).
  if (!cert.paidAt) {
    return new Response("Este certificado aún no fue pagado.", { status: 403, headers: NOINDEX_HEADERS });
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
      return new Response("Error al generar el certificado.", {
        status: 500,
        headers: NOINDEX_HEADERS,
      });
    }
  }

  // Re-chequeo barato de `revokedAt` justo antes de presignar: cierra la
  // ventana de carrera más ancha (la ventana es la de generación+subida del
  // PDF de arriba, que puede tardar segundos; una revocación puede ocurrir
  // en ese intervalo y el chequeo del inicio ya quedó obsoleto).
  const [actual] = await db
    .select({ revokedAt: certificates.revokedAt })
    .from(certificates)
    .where(eq(certificates.id, cert.id))
    .limit(1);
  if (!actual || actual.revokedAt) {
    return new Response("No encontrado.", { status: 404, headers: NOINDEX_HEADERS });
  }

  const url = await presignGet(pdfKey);
  return new Response(null, {
    status: 302,
    headers: { Location: url, ...NOINDEX_HEADERS },
  });
}
