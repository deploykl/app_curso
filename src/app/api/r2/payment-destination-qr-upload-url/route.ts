import { randomUUID } from "node:crypto";
import { assertRole } from "@/modules/auth/session";
import { validateProofUpload, destinationQrKey } from "@/modules/billing/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  await assertRole(["admin"]);
  const body = (await req.json()) as {
    destinationId?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const check = validateProofUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = destinationQrKey(body.destinationId ?? randomUUID(), body.fileName);
  const url = await presignPut(key, body.mimeType);
  return Response.json({ url, key });
}
