import { eq } from "drizzle-orm";
import { db } from "@/db";
import { instructorProfiles } from "@/db/schema";

export interface PayoutMethodInfo {
  payoutMethod: "yape" | "plin" | "transferencia" | "interbancario" | null;
  payoutHolderName: string | null;
  payoutIdentifier: string | null;
  payoutBankName: string | null;
  payoutQrImageKey: string | null;
}

export async function getPayoutMethod(instructorId: string): Promise<PayoutMethodInfo | null> {
  const [row] = await db
    .select({
      payoutMethod: instructorProfiles.payoutMethod,
      payoutHolderName: instructorProfiles.payoutHolderName,
      payoutIdentifier: instructorProfiles.payoutIdentifier,
      payoutBankName: instructorProfiles.payoutBankName,
      payoutQrImageKey: instructorProfiles.payoutQrImageKey,
    })
    .from(instructorProfiles)
    .where(eq(instructorProfiles.userId, instructorId))
    .limit(1);
  return row ?? null;
}
