import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Award,
  BookOpen,
  CalendarClock,
  Clock,
  GraduationCap,
  Lock,
  Radio,
  Video,
} from "lucide-react";
import { getPublicCourse } from "@/modules/catalog/queries";
import { getSessionUser } from "@/modules/auth/session";
import { isEnrolled } from "@/modules/auth/guards";
import { findPendingOrderForCourse } from "@/modules/billing/queries";
import { EnrollButton } from "@/modules/billing/ui/enroll-button";
import { categoryColor } from "@/modules/catalog/category-colors";
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
    cta = <EnrollButton courseId={course.id} courseSlug={course.slug} free={course.priceCents === 0} />;
  }

  const color = categoryColor(course.categoryName);
  const monogram = course.title
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  const totalMinutos = course.sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const iniciales = course.instructorName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/cursos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Volver al catálogo
      </Link>

      <div
        className="relative mt-4 flex h-48 items-end overflow-hidden rounded-2xl text-white sm:h-64"
        style={{
          background: course.coverUrl
            ? undefined
            : `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color}, black 25%))`,
        }}
      >
        {course.coverUrl && (
          <Image
            src={course.coverUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 960px, 100vw"
            unoptimized
            priority
          />
        )}
        {!course.coverUrl && (
          <span className="absolute right-6 top-6 text-7xl font-bold text-white/15">{monogram}</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="relative flex flex-wrap gap-2 p-5">
          {course.categoryName && (
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
              {course.categoryName}
            </span>
          )}
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
            {LEVEL_LABEL[course.level] ?? course.level}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide backdrop-blur-sm">
            {course.deliveryMode === "en_vivo" ? (
              <Radio className="size-3" />
            ) : (
              <Video className="size-3" />
            )}
            {course.deliveryMode === "en_vivo" ? "En vivo" : "Grabado"}
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-8">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1>
            {course.subtitle && (
              <p className="mt-2 text-lg text-muted-foreground">{course.subtitle}</p>
            )}

            <div className="mt-4 flex items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                {iniciales}
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-medium">{course.instructorName}</span>
                {course.instructorHeadline && (
                  <span className="text-xs text-muted-foreground">{course.instructorHeadline}</span>
                )}
              </div>
            </div>
          </div>

          {course.descriptionMd && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {course.descriptionMd}
            </p>
          )}

          <div>
            <h2 className="flex items-center gap-1.5 text-lg font-semibold">
              <BookOpen className="size-4.5 text-muted-foreground" />
              Temario
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {course.sessions.length}
              </span>
            </h2>
            <ol className="mt-3 flex flex-col gap-2.5">
              {course.sessions.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    {course.deliveryMode === "en_vivo" ? (
                      <Radio className="size-4" />
                    ) : (
                      <Video className="size-4" />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        <span className="text-muted-foreground">{i + 1}.</span> {s.title}
                      </span>
                      {s.isFreePreview && (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="size-3" />
                          Vista previa gratis
                        </Badge>
                      )}
                    </div>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {s.startsAt && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="size-3.5" />
                          {formatLima(s.startsAt)}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {s.durationMinutes} min
                      </span>
                      {s.hasRecording && <span>· Grabación disponible</span>}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {course.instructorBioMd && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <GraduationCap className="size-4 text-muted-foreground" />
                Sobre {course.instructorName}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {course.instructorBioMd}
              </p>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 lg:sticky lg:top-20">
          <span className="text-3xl font-bold tracking-tight">
            {course.priceCents === 0 ? "Gratis" : formatPEN(course.priceCents)}
          </span>

          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <BookOpen className="size-4" />
              {course.sessions.length} sesion{course.sessions.length === 1 ? "" : "es"}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" />
              {course.estimatedHours
                ? `${course.estimatedHours} horas estimadas`
                : `${Math.round(totalMinutos / 60)} horas de contenido`}
            </span>
            <span className="inline-flex items-center gap-2">
              <Award className="size-4" />
              Certificado al aprobar el examen
            </span>
          </div>

          <div className="flex flex-col items-stretch gap-1.5 [&>a]:w-full [&>button]:w-full [&_a]:w-full">
            {cta}
          </div>
        </aside>
      </div>
    </div>
  );
}
