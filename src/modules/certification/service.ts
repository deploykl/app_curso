import { randomInt } from "node:crypto";

// Sin 0, O, 1, I, L: se leen mal en pantalla y se confunden al dictarlos por teléfono.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function bloque(longitud: number): string {
  let out = "";
  for (let i = 0; i < longitud; i++) {
    // CSPRNG: el código es la única credencial de /verificar/[code] y del
    // endpoint del PDF, ambos sin autenticación. Math.random() es predecible.
    out += ALFABETO[randomInt(0, ALFABETO.length)];
  }
  return out;
}

/**
 * Código legible del certificado: 8 caracteres útiles en dos bloques de 4,
 * separados por un guion. No garantiza unicidad por sí solo — eso lo hace el
 * UNIQUE de la columna `code`, con reintento en la capa de inserción
 * (ver `emitirCertificado` en `issuance.ts`).
 */
export function generarCodigo(): string {
  return `${bloque(4)}-${bloque(4)}`;
}
