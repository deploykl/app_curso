import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, enrollments, sessionRemindersSent, user } from "@/db/schema";
import { sendEmail } from "@/modules/notifications/mailer";
import { sessionReminder24hTemplate } from "@/modules/notifications/templates/session-reminder-24h";
import { sessionReminder1hTemplate } from "@/modules/notifications/templates/session-reminder-1h";
import { formatLima } from "@/lib/datetime";

// NOTA: este archivo NO tiene "use server" a propósito. sendSessionReminders es
// lógica de servidor invocada exclusivamente desde una ruta de API protegida
// por CRON_SECRET (ver src/app/api/cron/recordatorios/route.ts), no una
// Server Action de UI. Si viviera en un módulo "use server", Next.js la
// registraría como endpoint público invocable sin auth por cualquiera.

export interface ReminderWindow {
  from: Date;
  to: Date;
}

export function reminderWindows(now: Date = new Date()): { kind24h: ReminderWindow; kind1h: ReminderWindow } {
  return {
    kind24h: {
      from: new Date(now.getTime() + 23 * 3_600_000 + 15 * 60_000),
      to: new Date(now.getTime() + 24 * 3_600_000 + 45 * 60_000),
    },
    kind1h: {
      from: new Date(now.getTime() + 45 * 60_000),
      to: new Date(now.getTime() + 1 * 3_600_000 + 15 * 60_000),
    },
  };
}

interface WindowResult {
  sent: number;
  failed: number;
}

async function sendForWindow(kind: "24h" | "1h", window: ReminderWindow): Promise<WindowResult> {
  const sessions = await db
    .select()
    .from(classSessions)
    .where(and(
      eq(classSessions.status, "scheduled"),
      gte(classSessions.startsAt, window.from),
      lte(classSessions.startsAt, window.to)
    ));

  let sentCount = 0;
  let failedCount = 0;
  for (const session of sessions) {
    const students = await db
      .select({ enrollmentId: enrollments.id, userId: user.id, email: user.email, name: user.name })
      .from(enrollments)
      .innerJoin(user, eq(user.id, enrollments.userId))
      .where(and(eq(enrollments.courseId, session.courseId), eq(enrollments.status, "active")));

    for (const s of students) {
      // El INSERT va ANTES del sendEmail a propósito: garantiza cero
      // duplicados aunque el proceso muera a mitad. Si insertó 0 filas,
      // ya se envió este recordatorio, se salta.
      const inserted = await db.insert(sessionRemindersSent)
        .values({ enrollmentId: s.enrollmentId, classSessionId: session.id, kind })
        .onConflictDoNothing({
          target: [sessionRemindersSent.enrollmentId, sessionRemindersSent.classSessionId, sessionRemindersSent.kind],
        })
        .returning({ enrollmentId: sessionRemindersSent.enrollmentId });
      if (inserted.length === 0) continue;

      const template = kind === "24h" ? sessionReminder24hTemplate : sessionReminder1hTemplate;
      const { subject, html, text } = template({
        name: s.name,
        sessionTitle: session.title,
        startsAtLabel: formatLima(session.startsAt),
        zoomUrl: session.zoomUrl,
      });
      const result = await sendEmail({ to: s.email, userId: s.userId, template: `session-reminder-${kind}`, subject, html, text });
      if (!result.ok) {
        // sendEmail nunca lanza: captura la excepción y devuelve { ok: false }.
        // Si no borramos la fila recién insertada, la próxima corrida del cron
        // hace "continue" al verla y este recordatorio se pierde para siempre.
        // La borramos para permitir reintento en la siguiente corrida.
        failedCount++;
        await db.delete(sessionRemindersSent).where(and(
          eq(sessionRemindersSent.enrollmentId, s.enrollmentId),
          eq(sessionRemindersSent.classSessionId, session.id),
          eq(sessionRemindersSent.kind, kind)
        ));
        continue;
      }
      sentCount++;
    }
  }
  return { sent: sentCount, failed: failedCount };
}

export async function sendSessionReminders(
  now: Date = new Date()
): Promise<{ sent24h: number; sent1h: number; failed: number }> {
  const windows = reminderWindows(now);
  const r24h = await sendForWindow("24h", windows.kind24h);
  const r1h = await sendForWindow("1h", windows.kind1h);
  return { sent24h: r24h.sent, sent1h: r1h.sent, failed: r24h.failed + r1h.failed };
}
