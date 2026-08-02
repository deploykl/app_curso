import { env } from "@/env";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function refundProcessedTemplate(input: { name: string; courseTitle: string; motivo: string }) {
  return {
    subject: `Reembolso procesado — ${input.courseTitle}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Procesamos el reembolso de tu compra de <strong>${escapeHtml(input.courseTitle)}</strong> en ${escapeHtml(env.ACADEMIA_NAME)}.</p>
  <p>Tu acceso al curso fue revocado. Motivo: ${escapeHtml(input.motivo)}</p>
</div>`.trim(),
  };
}
