import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicCourse } from "@/modules/catalog/queries";
import { getSessionUser } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { findPendingOrderForCourse } from "@/modules/billing/queries";
import { EnrollButton } from "@/modules/billing/ui/enroll-button";
import { formatPEN } from "@/lib/money";
import { formatLima } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

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

  // El estado del botón de compra se decide en el servidor: sin sesión, ya
  // inscrito, con una orden pendiente sin pagar, o listo para comprar.
  const yaInscrito = sessionUser ? await isEnrolled(sessionUser.id, course.id) : false;
  const ordenPendiente =
    sessionUser && !yaInscrito
      ? await findPendingOrderForCourse(sessionUser.id, course.id)
      : null;

  let cta: React.ReactNode;
  if (!sessionUser) {
    cta = (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/cursos/${course.slug}`)}`}
        className={buttonVariants({ size: "xl" })}
      >
        Inscribirme
      </Link>
    );
  } else if (yaInscrito) {
    cta = (
      <Link href={`/curso/${course.slug}/aprender`} className={buttonVariants({ size: "xl" })}>
        Ir al curso
      </Link>
    );
  } else if (ordenPendiente) {
    cta = (
      <div className="flex flex-col items-end gap-1.5">
        <Link
          href={`/pago/${ordenPendiente.orderNumber}`}
          className={buttonVariants({ size: "xl" })}
        >
          Continuar mi pago
        </Link>
        <span className="text-xs text-muted-foreground">
          Tienes la orden {ordenPendiente.orderNumber} pendiente de pago.
        </span>
      </div>
    );
  } else if (!sessionUser.emailVerified) {
    cta = (
      <div className="flex flex-col items-end gap-1.5">
        <span className={buttonVariants({ size: "xl", variant: "outline" })}>
          Verifica tu correo
        </span>
        <span className="text-xs text-muted-foreground">
          Revisa tu bandeja para activar la cuenta y poder inscribirte.
        </span>
      </div>
    );
  } else {
    cta = <EnrollButton courseId={course.id} />;
  }

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

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-6">
        <span className="text-2xl font-semibold">{formatPEN(course.priceCents)}</span>
        {cta}
      </div>
    </div>
  );
}
