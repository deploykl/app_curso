// Sin "use server" a propósito: lo invoca el route handler del PDF, no es un
// endpoint por sí mismo.
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { putObject } from "@/lib/r2";
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

// Paleta: azul noche + oro apagado sobre blanco. Las únicas familias
// disponibles sin registrar fuentes externas (el render corre en el server, sin
// red garantizada) son las base de PDF: Times para el display, Helvetica para
// etiquetas y datos.
const C = {
  navy: "#0B1B3A",
  navySoft: "#1D3461",
  gold: "#B98B37",
  goldSoft: "#DFCBA0",
  ink: "#2B3648",
  slate: "#77839A",
  cream: "#FBF7EE",
  watermark: "#F7F9FD",
};

const styles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", fontFamily: "Helvetica" },

  // Marco doble: hairline dorado exterior + filete azul interior.
  frameOuter: {
    position: "absolute",
    top: 18, left: 18, right: 18, bottom: 18,
    borderWidth: 1.5,
    borderColor: C.gold,
  },
  frameInner: {
    position: "absolute",
    top: 24, left: 24, right: 24, bottom: 24,
    borderWidth: 0.5,
    borderColor: C.navySoft,
  },
  // Monograma gigante detrás del contenido, casi al límite del papel.
  watermark: {
    position: "absolute",
    top: 165, left: 0, right: 0,
    textAlign: "center",
    fontFamily: "Times-Bold",
    fontSize: 200,
    color: C.watermark,
  },

  content: { flexGrow: 1, paddingVertical: 46, paddingHorizontal: 58 },

  header: { flexDirection: "row", alignItems: "center" },
  logoRing: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1, borderColor: C.gold,
    padding: 3,
  },
  logoDisc: {
    flexGrow: 1, borderRadius: 24,
    backgroundColor: C.navy,
    alignItems: "center", justifyContent: "center",
  },
  logoText: { fontFamily: "Times-Bold", fontSize: 17, color: "#FFFFFF", letterSpacing: 1 },
  headerTexto: { flexGrow: 1, marginLeft: 14 },
  academia: { fontFamily: "Helvetica-Bold", fontSize: 12.5, letterSpacing: 2.6, color: C.navy },
  academiaSub: { marginTop: 4, fontSize: 7.5, letterSpacing: 1.8, color: C.slate },
  folio: { alignItems: "flex-end" },
  folioLabel: { fontSize: 7, letterSpacing: 1.6, color: C.slate },
  folioCode: { marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 10, letterSpacing: 1.4, color: C.gold },

  rule: { height: 1, backgroundColor: C.goldSoft, marginTop: 16 },
  ruleAccent: { position: "absolute", top: -1, left: 0, width: 68, height: 3, backgroundColor: C.gold },

  centro: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  tituloDisplay: { fontFamily: "Times-Bold", fontSize: 40, letterSpacing: 9, color: C.navy },
  tituloSub: { fontFamily: "Times-Italic", fontSize: 16, letterSpacing: 1.2, color: C.gold, marginTop: 4 },
  otorgado: { fontSize: 7.5, letterSpacing: 3, color: C.slate, marginTop: 26 },
  alumno: { fontFamily: "Times-Bold", fontSize: 30, color: C.navy, marginTop: 10 },
  alumnoRule: { width: 240, height: 1, backgroundColor: C.goldSoft, marginTop: 10 },
  cuerpo: {
    marginTop: 16, maxWidth: 520,
    fontSize: 10.5, lineHeight: 1.7, color: C.ink, textAlign: "center",
  },
  cursoNombre: { fontFamily: "Helvetica-Bold", color: C.navy },

  chips: { flexDirection: "row", marginTop: 20 },
  chip: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.cream,
    borderWidth: 0.5, borderColor: C.goldSoft,
    borderRadius: 11,
    paddingVertical: 5, paddingHorizontal: 12,
    marginHorizontal: 5,
  },
  chipLabel: { fontSize: 7, letterSpacing: 1.4, color: C.slate, marginRight: 7 },
  chipValor: { fontFamily: "Helvetica-Bold", fontSize: 10, color: C.navy },

  pie: { flexDirection: "row", alignItems: "flex-end", marginTop: 30 },
  pieCol: { width: 190 },
  pieCentro: { flexGrow: 1, alignItems: "center" },
  pieDerecha: { width: 190, alignItems: "flex-end" },
  firma: { fontFamily: "Times-Italic", fontSize: 15, color: C.navySoft },
  firmaLinea: { width: 170, height: 0.8, backgroundColor: C.navySoft, marginTop: 6 },
  pieLabel: { fontSize: 7, letterSpacing: 1.6, color: C.slate, marginTop: 6 },
  pieValor: { marginTop: 3, fontSize: 10, color: C.ink },
  pieCodigo: { marginTop: 3, fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 1.6, color: C.navy },
  qrCaja: { borderWidth: 0.5, borderColor: C.goldSoft, padding: 4 },
  qr: { width: 62, height: 62 },
  qrCaption: { marginTop: 5, fontSize: 6.5, letterSpacing: 0.8, color: C.slate, textAlign: "right" },
});

/** Iniciales de la academia — placeholder del logo mientras no haya imagen propia. */
function monograma(academyName: string): string {
  const iniciales = academyName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((palabra) => palabra[0] ?? "")
    .join("");
  return (iniciales || academyName.slice(0, 2) || "AC").toUpperCase();
}

function formatearNota(nota: number): string {
  return Number.isInteger(nota) ? String(nota) : nota.toFixed(1);
}

async function documento(c: CertificadoParaPdf) {
  const verificarUrl = `${env.NEXT_PUBLIC_APP_URL}/verificar/${c.code}`;
  const qrDataUrl = await QRCode.toDataURL(verificarUrl, {
    margin: 0,
    width: 240,
    color: { dark: C.navy, light: "#FFFFFF" },
  });
  const mono = monograma(c.academyName);
  const host = env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <Document
      title={`Certificado ${c.code}`}
      author={c.academyName}
      subject={`Certificado de finalización — ${c.courseTitle}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.frameOuter} />
        <View style={styles.frameInner} />
        <Text style={styles.watermark}>{mono}</Text>

        <View style={styles.content}>
          <View style={styles.header}>
            {/* Placeholder del logo: medallón con el monograma de la academia. */}
            <View style={styles.logoRing}>
              <View style={styles.logoDisc}>
                <Text style={styles.logoText}>{mono}</Text>
              </View>
            </View>
            <View style={styles.headerTexto}>
              <Text style={styles.academia}>{c.academyName.toUpperCase()}</Text>
              <Text style={styles.academiaSub}>CERTIFICADO OFICIAL DE FORMACIÓN</Text>
            </View>
            <View style={styles.folio}>
              <Text style={styles.folioLabel}>FOLIO</Text>
              <Text style={styles.folioCode}>{c.code}</Text>
            </View>
          </View>

          <View style={styles.rule}>
            <View style={styles.ruleAccent} />
          </View>

          <View style={styles.centro}>
            <Text style={styles.tituloDisplay}>CERTIFICADO</Text>
            <Text style={styles.tituloSub}>de finalización</Text>

            <Text style={styles.otorgado}>SE OTORGA EL PRESENTE A</Text>
            <Text style={styles.alumno}>{c.studentName}</Text>
            <View style={styles.alumnoRule} />

            <Text style={styles.cuerpo}>
              Por haber completado y aprobado satisfactoriamente el curso{" "}
              <Text style={styles.cursoNombre}>{c.courseTitle}</Text>, dictado por {c.instructorName}
              {" "}en {c.academyName}.
            </Text>

            <View style={styles.chips}>
              <View style={styles.chip}>
                <Text style={styles.chipLabel}>NOTA FINAL</Text>
                <Text style={styles.chipValor}>{formatearNota(c.finalScore)}%</Text>
              </View>
              {c.hours !== null && (
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>DURACIÓN</Text>
                  <Text style={styles.chipValor}>{c.hours} horas</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.pie}>
            <View style={styles.pieCol}>
              <Text style={styles.firma}>{c.instructorName}</Text>
              <View style={styles.firmaLinea} />
              <Text style={styles.pieLabel}>INSTRUCTOR DEL CURSO</Text>
            </View>

            <View style={styles.pieCentro}>
              <Text style={styles.pieLabel}>FECHA DE EMISIÓN</Text>
              <Text style={styles.pieValor}>{formatLima(c.issuedAt)}</Text>
              <Text style={styles.pieLabel}>CÓDIGO DE VERIFICACIÓN</Text>
              <Text style={styles.pieCodigo}>{c.code}</Text>
            </View>

            <View style={styles.pieDerecha}>
              <View style={styles.qrCaja}>
                <Image style={styles.qr} src={qrDataUrl} />
              </View>
              <Text style={styles.qrCaption}>Verifica su autenticidad en</Text>
              <Text style={styles.qrCaption}>{host}/verificar</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Renderiza el PDF, lo sube a R2 y devuelve la key. No persiste `pdfKey` en la BD: eso lo hace el llamador. */
export async function generarYSubirPdf(c: CertificadoParaPdf): Promise<string> {
  try {
    const doc = await documento(c);
    const buffer = await renderToBuffer(doc);
    const key = `certificados/${c.code}/pdf/certificado.pdf`;

    await putObject(key, Buffer.from(buffer), "application/pdf");

    return key;
  } catch (err) {
    console.error("Error generando/subiendo el PDF del certificado:", c.code, err);
    throw err;
  }
}
