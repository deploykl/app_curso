import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/env";

/*
  Dos backends con la misma interfaz:

  - R2 (Cloudflare) cuando hay credenciales completas en el entorno.
  - Disco local cuando no las hay. El navegador sube y descarga contra rutas de
    la propia app (mismo origen, así que no hace falta CORS ni cuenta de pago),
    y los archivos viven en LOCAL_STORAGE_DIR, fuera de public/ para que nadie
    los pueda leer sin pasar por la verificación de firma.

  El resto del código no distingue: siempre llama a presignPut/presignGet/
  putObject/deleteObject.
*/
export const usingR2 = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
);

// ---------------------------------------------------------------- backend R2

let client: S3Client | null = null;
function r2Client() {
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

// -------------------------------------------------------------- backend local

export const LOCAL_ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR ?? ".uploads");

/**
 * Traduce una key a una ruta dentro de LOCAL_ROOT. Lanza si la key intenta
 * escaparse del directorio ("../", rutas absolutas, etc.).
 */
export function localPathFor(key: string): string {
  const full = path.resolve(LOCAL_ROOT, key);
  if (full !== LOCAL_ROOT && !full.startsWith(LOCAL_ROOT + path.sep)) {
    throw new Error("Key de almacenamiento inválida.");
  }
  return full;
}

/**
 * Firma HMAC que hace las veces de URL presignada: sin ella cualquiera podría
 * escribir o leer cualquier key. Va atada al método y a una expiración.
 */
function sign(key: string, method: "GET" | "PUT", exp: number): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${method}:${key}:${exp}`)
    .digest("hex");
}

export function verifyLocalSignature(
  key: string,
  method: "GET" | "PUT",
  exp: string | null,
  sig: string | null
): boolean {
  if (!exp || !sig) return false;
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  const expected = Buffer.from(sign(key, method, expMs));
  const received = Buffer.from(sig);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function localUrl(key: string, method: "GET" | "PUT", expiresIn: number): string {
  const exp = Date.now() + expiresIn * 1000;
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const params = new URLSearchParams({ m: method, exp: String(exp), sig: sign(key, method, exp) });
  return `${env.NEXT_PUBLIC_APP_URL}/api/archivos/${encoded}?${params}`;
}

// ----------------------------------------------------------------- interfaz

/** URL temporal a la que el navegador puede hacer PUT del archivo. */
export async function presignPut(key: string, contentType: string, expiresIn = 300): Promise<string> {
  if (!usingR2) return localUrl(key, "PUT", expiresIn);
  return getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn }
  );
}

/** URL temporal de descarga. */
export async function presignGet(key: string, expiresIn = 300): Promise<string> {
  if (!usingR2) return localUrl(key, "GET", expiresIn);
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }), {
    expiresIn,
  });
}

/** Subida desde el servidor (por ejemplo, el PDF del certificado). */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!usingR2) {
    const full = localPathFor(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    return;
  }
  await r2Client().send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: contentType })
  );
}

export async function getObject(key: string): Promise<Buffer> {
  if (!usingR2) return readFile(localPathFor(key));
  const res = await r2Client().send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key })
  );
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function deleteObject(key: string): Promise<void> {
  if (!usingR2) {
    // Que el archivo ya no exista no es un error: el objetivo es que no esté.
    await unlink(localPathFor(key)).catch(() => {});
    return;
  }
  await r2Client().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
}
