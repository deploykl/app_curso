import { env } from "@/env";

export function verifyEmailTemplate(input: { name: string; url: string }) {
  return {
    subject: `Verifica tu correo — ${env.ACADEMIA_NAME}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>Confirma tu correo para activar tu cuenta en <strong>${escapeHtml(env.ACADEMIA_NAME)}</strong>.</p>
  <p style="margin:28px 0">
    <a href="${input.url}"
       style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">
      Verificar mi correo
    </a>
  </p>
  <p style="color:#666;font-size:13px">El enlace vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}
