import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getCourseAgenda } from "@/modules/learning/queries";
import { formatLima } from "@/lib/datetime";

const STATE_LABEL: Record<string, string> = {
  upcoming: "Próxima",
  live: "EN VIVO AHORA",
  past: "Finalizada",
};

export default async function AgendaCursoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const u = await requireUser();

  let agenda;
  try {
    agenda = await getCourseAgenda(u.id, slug);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!agenda) notFound();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{agenda.title}</h1>
      <div className="flex flex-col gap-3">
        {agenda.sessions.map((s) => (
          <Link
            key={s.id}
            href={`/curso/${slug}/aprender/${s.id}`}
            className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/40"
          >
            <div>
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-muted-foreground">{formatLima(s.startsAt)}</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              {s.attended && <span className="text-muted-foreground">✓</span>}
              <span>{STATE_LABEL[s.state]}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
