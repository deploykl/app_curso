import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export interface PlatformSettings {
  earningAvailableDays: number;
}

const DEFAULTS: PlatformSettings = { earningAvailableDays: 7 };

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  return row ? { earningAvailableDays: row.earningAvailableDays } : DEFAULTS;
}
