import { assertRole } from "@/modules/auth/session";
import { validateProofUpload } from "@/modules/billing/service";
import { payoutQrKey } from "@/modules/profiles/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  const u = await assertRole(["instructor", "admin"]);
  const body = (await req.json()) as {
    fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const check = validateProofUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = payoutQrKey(u.id, body.fileName);
  const url = await presignPut(key, body.mimeType);
  return Response.json({ url, key });
}
