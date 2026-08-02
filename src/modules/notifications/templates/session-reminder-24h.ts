import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function sessionReminder24hTemplate(input: {
  name: string;
  sessionTitle: string;
  startsAtLabel: string;
  zoomUrl: string | null;
}) {
  return {
    subject: `Mañana: ${input.sessionTitle}`,
    ...renderBoth({
      preheader: `${input.sessionTitle} — ${input.startsAtLabel}`,
      heading: `Hola ${input.name}, mañana tienes clase`,
      body: [
        `<strong style="color:#221f38">${escapeHtml(
          input.sessionTitle
        )}</strong><br />${escapeHtml(input.startsAtLabel)} · hora de Perú`,
        `Te esperamos en directo en ${escapeHtml(
          env.ACADEMIA_NAME
        )}. Si no puedes asistir, la grabación quedará disponible en tu aula.`,
      ],
      cta: input.zoomUrl
        ? { label: "Entrar a la clase", url: input.zoomUrl }
        : { label: "Ver mi aula", url: `${env.NEXT_PUBLIC_APP_URL}/mi-aprendizaje` },
    }),
  };
}
