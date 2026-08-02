import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function verifyEmailTemplate(input: { name: string; url: string }) {
  return {
    subject: `Verifica tu correo — ${env.ACADEMIA_NAME}`,
    ...renderBoth({
      preheader: `Confirma tu correo para activar tu cuenta en ${env.ACADEMIA_NAME}.`,
      heading: `Hola ${input.name}, confirma tu correo`,
      body: [
        `Solo falta un paso para activar tu cuenta en <strong style="color:#221f38">${escapeHtml(
          env.ACADEMIA_NAME
        )}</strong> y poder inscribirte a los cursos en vivo.`,
      ],
      cta: { label: "Verificar mi correo", url: input.url },
      footnote:
        "El enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este mensaje.",
    }),
  };
}
