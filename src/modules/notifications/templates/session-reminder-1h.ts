import { env } from "@/env";

export function sessionReminder1hTemplate(input: {
  name: string; sessionTitle: string; startsAtLabel: string; zoomUrl: string | null;
}) {
  return {
    subject: `En 1 hora: ${input.sessionTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Tu clase <strong>${escapeHtml(input.sessionTitle)}</strong> empieza en 1 hora (${escapeHtml(input.startsAtLabel)}) en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
  ${input.zoomUrl ? `<p><a href="${escapeAttr(input.zoomUrl)}">Entrar a la clase</a></p>` : ""}
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
