import { env } from "@/env";

export function orderApprovedTemplate(input: { name: string; courseTitle: string }) {
  return {
    subject: `Tu acceso está listo — ${input.courseTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Confirmamos tu pago. Ya tienes acceso a <strong>${escapeHtml(input.courseTitle)}</strong> en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
