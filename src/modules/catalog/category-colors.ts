// Paleta fija en oklch para identificar categorías por color en las tarjetas
// del instructor. No depende de una columna "color" en la BD: la categoría
// se hashea a un índice estable, así que el mismo nombre siempre cae en el
// mismo color aunque se agreguen categorías nuevas.
const PALETTE = [
  "oklch(0.58 0.19 265)", // índigo — coincide con el primary de la marca
  "oklch(0.66 0.19 20)", // coral
  "oklch(0.6 0.13 165)", // verde azulado
  "oklch(0.68 0.16 55)", // ámbar
  "oklch(0.6 0.16 320)", // magenta
] as const;

export function categoryColor(name: string | null): string {
  if (!name) return "oklch(0.5 0.02 275)"; // gris neutro para "sin categoría"
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
