import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicCourse } from "@/modules/catalog/queries";
import { getSessionUser } from "@/modules/auth/session";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";

const LEVEL_LABEL: Record<string, string> = {
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublicCourse(slug);
  if (!course) return {};
  return {
    title: course.title,
    description: course.subtitle ?? course.descriptionMd?.slice(0, 160) ?? undefined,
  };
}

export default async function CursoDetallePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const course = await getPublicCourse(slug);
  if (!course) notFound();

  const sessionUser = await getSessionUser();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-center gap-2">
        {course.categoryName && <Badge variant="secondary">{course.categoryName}</Badge>}
        <Badge variant="outline">{LEVEL_LABEL[course.level] ?? course.level}</Badge>
      </div>

      <h1 className="mt-3 text-3xl font-semibold">{course.title}</h1>
      {course.subtitle && <p className="mt-2 text-lg text-muted-foreground">{course.subtitle}</p>}

      <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
        <span>Por {course.instructorName}</span>
        {course.instructorHeadline && <span>· {course.instructorHeadline}</span>}
        {course.estimatedHours && <span>· {course.estimatedHours} horas</span>}
      </div>

      {course.descriptionMd && (
        <p className="mt-6 whitespace-pre-wrap text-foreground">{course.descriptionMd}</p>
      )}

      <h2 className="mt-10 text-xl font-semibold">Temario</h2>
      <ol className="mt-4 flex flex-col gap-3">
        {course.sessions.map((s, i) => (
          <li key={s.id} className="flex flex-col gap-1 rounded-md border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{i + 1}. {s.title}</span>
              {s.isFreePreview && <Badge variant="secondary">Vista previa gratis</Badge>}
            </div>
            <span className="text-sm text-muted-foreground">
              {formatLima(s.startsAt)} · {s.durationMinutes} min
              {s.hasRecording && " · Grabación disponible"}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-10 flex items-center justify-between rounded-lg border border-border p-6">
        <span className="text-2xl font-semibold">{formatPEN(course.priceCents)}</span>
        {sessionUser ? (
          <span className="rounded-md bg-muted px-6 py-3 text-sm font-medium text-muted-foreground">
            Próximamente
          </span>
        ) : (
          <Link href="/login" className="rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
            Inscribirme
          </Link>
        )}
      </div>
    </div>
  );
}
