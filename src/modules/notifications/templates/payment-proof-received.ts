import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function paymentProofReceivedTemplate(input: {
  orderNumber: string;
  courseTitle: string;
}) {
  return {
    subject: `Nuevo comprobante por revisar — ${input.orderNumber}`,
    ...renderBoth({
      preheader: `Orden ${input.orderNumber} · ${input.courseTitle}`,
      heading: "Hay un comprobante esperando revisión",
      body: [
        `Un alumno subió su comprobante para la orden <strong style="color:#221f38">${escapeHtml(
          input.orderNumber
        )}</strong> (${escapeHtml(input.courseTitle)}).`,
        "Verifica el monto y el nombre del titular en tu app de Yape o del banco antes de aprobar.",
      ],
      cta: { label: "Revisar comprobante", url: `${env.NEXT_PUBLIC_APP_URL}/admin/pagos` },
    }),
  };
}
