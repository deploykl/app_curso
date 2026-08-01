import { env } from "@/env";
import { sendSessionReminders } from "@/modules/learning/jobs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const result = await sendSessionReminders();
  return Response.json(result);
}
