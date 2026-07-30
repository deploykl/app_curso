export function formatPEN(cents: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `S/ ${formatted}`;
}

export function solesToCents(soles: string | number): number {
  const n = typeof soles === "string" ? Number(soles.trim()) : soles;
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Monto inválido: ${soles}`);
  }
  return Math.round(n * 100);
}
