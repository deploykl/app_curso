import { env } from "@/env";
import { escapeHtml, renderBoth } from "./layout";

export function sessionReminder1hTemplate(input: {
  name: string;
  sessionTitle: string;
  startsAtLabel: string;
  zoomUrl: string | null;
}) {
  return {
    subject: `En 1 hora: ${input.sessionTitle}`,
    ...renderBoth({
      preheader: `${input.sessionTitle} empieza a las ${input.startsAtLabel}.`,
      heading: `${input.name}, tu clase empieza en 1 hora`,
      body: [
        `<strong style="color:#221f38">${escapeHtml(
          input.sessionTitle
        )}</strong><br />${escapeHtml(input.startsAtLabel)} · hora de Perú`,
        `Ten a mano tus materiales y entra unos minutos antes en ${escapeHtml(
          env.ACADEMIA_NAME
        )}.`,
      ],
      cta: input.zoomUrl
        ? { label: "Entrar a la clase", url: input.zoomUrl }
        : { label: "Ver mi aula", url: `${env.NEXT_PUBLIC_APP_URL}/mi-aprendizaje` },
    }),
  };
}
