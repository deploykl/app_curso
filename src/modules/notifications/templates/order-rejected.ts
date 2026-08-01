export function orderRejectedTemplate(input: { name: string; courseTitle: string; reason: string; orderNumber: string }) {
  return {
    subject: `Tu comprobante no pudo validarse — ${input.orderNumber}`,
    html: `
<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px">Hola ${escapeHtml(input.name)},</h1>
  <p>No pudimos validar tu comprobante para <strong>${escapeHtml(input.courseTitle)}</strong>: ${escapeHtml(input.reason)}</p>
  <p>Puedes subir un nuevo comprobante en la misma página de pago.</p>
</div>`.trim(),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
