// Sin "use server" a propósito: lo invoca el route handler del PDF, no es un
// endpoint por sí mismo.
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { r2 } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/env";
import { formatLima } from "@/lib/datetime";

export interface CertificadoParaPdf {
  code: string;
  studentName: string;
  courseTitle: string;
  instructorName: string;
  academyName: string;
  hours: number | null;
  finalScore: number;
  issuedAt: Date;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 12, fontFamily: "Helvetica" },
  academia: { fontSize: 18, fontWeight: 700, marginBottom: 24 },
  titulo: { fontSize: 22, fontWeight: 700, marginBottom: 8 },
  cuerpo: { fontSize: 13, marginBottom: 24, lineHeight: 1.5 },
  fila: { flexDirection: "row", justifyContent: "space-between", marginTop: 32 },
  etiqueta: { fontSize: 9, color: "#666" },
  qr: { width: 80, height: 80 },
});

function documento(c: CertificadoParaPdf) {
  return QRCode.toDataURL(`${env.NEXT_PUBLIC_APP_URL}/verificar/${c.code}`).then((qrDataUrl) => (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.academia}>{c.academyName}</Text>
        <Text style={styles.titulo}>Certificado de finalización</Text>
        <Text style={styles.cuerpo}>
          Se certifica que {c.studentName} completó y aprobó el curso &quot;{c.courseTitle}&quot;
          {c.hours !== null ? ` (${c.hours} horas)` : ""}, dictado por {c.instructorName},
          con una nota final de {c.finalScore}%.
        </Text>
        <View style={styles.fila}>
          <View>
            <Text style={styles.etiqueta}>Fecha de emisión</Text>
            <Text>{formatLima(c.issuedAt)}</Text>
            <Text style={[styles.etiqueta, { marginTop: 8 }]}>Código de verificación</Text>
            <Text>{c.code}</Text>
          </View>
          <Image style={styles.qr} src={qrDataUrl} />
        </View>
      </Page>
    </Document>
  ));
}

/** Renderiza el PDF, lo sube a R2 y devuelve la key. No persiste `pdfKey` en la BD: eso lo hace el llamador. */
export async function generarYSubirPdf(c: CertificadoParaPdf): Promise<string> {
  const doc = await documento(c);
  const buffer = await renderToBuffer(doc);
  const key = `certificados/${c.code}/pdf/certificado.pdf`;

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: "application/pdf",
    })
  );

  return key;
}
