import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function orderApprovedTemplate(input: { name: string; courseTitle: string }) {
  return {
    subject: `Tu acceso está listo — ${input.courseTitle}`,
    ...renderBoth({
      preheader: `Confirmamos tu pago. Ya puedes entrar a ${input.courseTitle}.`,
      heading: `Hola ${input.name}, tu acceso está listo`,
      body: [
        `Confirmamos tu pago y ya tienes acceso a <strong style="color:#221f38">${escapeHtml(
          input.courseTitle
        )}</strong> en ${escapeHtml(env.ACADEMIA_NAME)}.`,
        "En tu aula verás las fechas de las clases en vivo, el enlace de Zoom y los materiales de cada sesión.",
      ],
      cta: { label: "Ir a mi aprendizaje", url: `${env.NEXT_PUBLIC_APP_URL}/mi-aprendizaje` },
    }),
  };
}
