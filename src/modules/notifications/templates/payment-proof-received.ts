export function paymentProofReceivedTemplate(input: { orderNumber: string; courseTitle: string }) {
  return {
    subject: `Nuevo comprobante por revisar — ${input.orderNumber}`,
    html: `<p>Llegó un comprobante para la orden <strong>${input.orderNumber}</strong> (${escapeHtml(input.courseTitle)}). Revísalo en /admin/pagos.</p>`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
