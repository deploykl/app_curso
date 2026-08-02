import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function orderRejectedTemplate(input: {
  name: string;
  courseTitle: string;
  reason: string;
  orderNumber: string;
}) {
  return {
    subject: `Tu comprobante no pudo validarse — ${input.orderNumber}`,
    ...renderBoth({
      preheader: `Revisa el motivo y sube un nuevo comprobante para ${input.courseTitle}.`,
      heading: `Hola ${input.name}, no pudimos validar tu comprobante`,
      body: [
        `Revisamos el comprobante que subiste para <strong style="color:#221f38">${escapeHtml(
          input.courseTitle
        )}</strong> (orden ${escapeHtml(input.orderNumber)}) y no pudimos aprobarlo.`,
        `<strong style="color:#221f38">Motivo:</strong> ${escapeHtml(input.reason)}`,
        "No pierdes tu orden: puedes subir un comprobante nuevo desde la misma página de pago.",
      ],
      cta: {
        label: "Subir otro comprobante",
        url: `${env.NEXT_PUBLIC_APP_URL}/pago/${input.orderNumber}`,
      },
    }),
  };
}
