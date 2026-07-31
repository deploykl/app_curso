import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUser } from "@/modules/auth/session";
import { validateProofUpload, proofKey } from "@/modules/billing/service";
import { presignPut } from "@/lib/r2";

export async function POST(req: Request) {
  const u = await requireUser();
  const body = (await req.json()) as {
    orderId?: string; fileName?: string; mimeType?: string; sizeBytes?: number;
  };

  if (!body.orderId || !body.fileName || !body.mimeType || !body.sizeBytes) {
    return Response.json({ error: "Datos incompletos." }, { status: 400 });
  }

  const [order] = await db.select({ userId: orders.userId })
    .from(orders).where(eq(orders.id, body.orderId)).limit(1);
  if (!order) return Response.json({ error: "Orden no encontrada." }, { status: 404 });
  if (order.userId !== u.id) return Response.json({ error: "Sin permiso." }, { status: 403 });

  const check = validateProofUpload({
    fileName: body.fileName, mimeType: body.mimeType, sizeBytes: body.sizeBytes,
  });
  if (!check.ok) return Response.json({ error: check.reason }, { status: 400 });

  const key = proofKey(body.orderId, body.fileName);
  const url = await presignPut(key, body.mimeType);
  return Response.json({ url, key });
}
