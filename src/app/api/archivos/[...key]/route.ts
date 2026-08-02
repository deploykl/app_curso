import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { localPathFor, usingR2, verifyLocalSignature } from "@/lib/r2";

/*
  Equivalente local de una URL presignada de R2: sirve para subir (PUT) y
  descargar (GET) cuando el proyecto corre sin credenciales de Cloudflare.

  La autorización real (¿es tu orden?, ¿eres admin?) ya la hizo la ruta que
  generó la URL; aquí solo se comprueba que la firma HMAC sea válida, no haya
  expirado y corresponda al método usado. Sin firma válida, 403.
*/

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

function guard(req: Request, key: string, method: "GET" | "PUT") {
  if (usingR2) return new Response("No disponible.", { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("m") !== method) return new Response("Prohibido.", { status: 403 });
  const ok = verifyLocalSignature(
    key,
    method,
    url.searchParams.get("exp"),
    url.searchParams.get("sig")
  );
  return ok ? null : new Response("Enlace inválido o vencido.", { status: 403 });
}

async function keyFrom(params: Promise<{ key: string[] }>) {
  const { key } = await params;
  return key.map(decodeURIComponent).join("/");
}

export async function PUT(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = await keyFrom(params);
  const denied = guard(req, key, "PUT");
  if (denied) return denied;

  const full = localPathFor(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await req.arrayBuffer()));
  return new Response(null, { status: 204 });
}

export async function GET(req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = await keyFrom(params);
  const denied = guard(req, key, "GET");
  if (denied) return denied;

  let file: Buffer;
  try {
    file = await readFile(localPathFor(key));
  } catch {
    return new Response("No encontrado.", { status: 404 });
  }

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${path.basename(key)}"`,
      // Los enlaces son temporales y el contenido es privado.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
