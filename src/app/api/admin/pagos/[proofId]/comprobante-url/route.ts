import { eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentProofs } from "@/db/schema";
import { assertRole } from "@/modules/auth/session";
import { presignGet } from "@/lib/r2";

export async function GET(_req: Request, { params }: { params: Promise<{ proofId: string }> }) {
  await assertRole(["admin"]);
  const { proofId } = await params;

  const [proof] = await db.select({ proofFileKey: paymentProofs.proofFileKey })
    .from(paymentProofs).where(eq(paymentProofs.id, proofId)).limit(1);
  if (!proof) return Response.json({ error: "Comprobante no encontrado." }, { status: 404 });

  const url = await presignGet(proof.proofFileKey);
  return Response.json({ url });
}
