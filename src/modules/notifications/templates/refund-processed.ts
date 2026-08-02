import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function refundProcessedTemplate(input: {
  name: string;
  courseTitle: string;
  motivo: string;
}) {
  return {
    subject: `Reembolso procesado — ${input.courseTitle}`,
    ...renderBoth({
      preheader: `Procesamos el reembolso de ${input.courseTitle}.`,
      heading: `Hola ${input.name}, procesamos tu reembolso`,
      body: [
        `Procesamos el reembolso de tu compra de <strong style="color:#221f38">${escapeHtml(
          input.courseTitle
        )}</strong> en ${escapeHtml(env.ACADEMIA_NAME)}.`,
        `<strong style="color:#221f38">Motivo:</strong> ${escapeHtml(input.motivo)}`,
        "Tu acceso al curso quedó revocado y, si ya se había emitido, el certificado también.",
      ],
      footnote:
        "El abono puede tardar unos días hábiles en reflejarse según tu banco o billetera.",
    }),
  };
}
