import Image from "next/image";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPEN } from "@/lib/money";
import type { CourseCard as CourseCardData } from "@/modules/catalog/queries";

const LEVEL_LABEL: Record<string, string> = {
  basico: "Básico",
  intermedio: "Intermedio",
  avanzado: "Avanzado",
};

/** Degradado estable por curso: sin portada, cada curso mantiene su color. */
const PLACEHOLDER_GRADIENTS = [
  "from-primary/25 via-chart-4/20 to-chart-2/20",
  "from-chart-2/25 via-primary/15 to-chart-4/25",
  "from-chart-4/30 via-chart-2/15 to-primary/20",
];

function gradientFor(slug: string) {
  let hash = 0;
  for (const ch of slug) hash = (hash + ch.charCodeAt(0)) % 997;
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <Link
      href={`/cursos/${course.slug}`}
      className="glass group flex flex-col overflow-hidden rounded-2xl outline-none transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-28px_var(--primary)] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="relative aspect-[16/9] overflow-hidden border-b border-border/60">
        {course.coverUrl ? (
          <Image
            src={course.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
            /* El host de las portadas no está fijado en la config: servimos el
               original sin pasar por el optimizador para no acoplarnos a R2. */
            unoptimized
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            aria-hidden
            className={`size-full bg-gradient-to-br ${gradientFor(course.slug)} transition-transform duration-500 group-hover:scale-105`}
          >
            <span className="grid size-full place-items-center font-mono text-5xl font-bold text-foreground/10">
              {course.title.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{course.categoryName ?? "General"}</Badge>
          <Badge variant="outline">{LEVEL_LABEL[course.level] ?? course.level}</Badge>
        </div>

        <h3 className="text-lg font-semibold tracking-tight text-balance text-foreground">
          {course.title}
        </h3>
        {course.subtitle && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {course.subtitle}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div className="min-w-0 text-sm text-muted-foreground">
            <p className="truncate">{course.instructorName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs">
              <UsersIcon className="size-3.5" />
              {course.sessionCount} {course.sessionCount === 1 ? "sesión" : "sesiones"} en vivo
            </p>
          </div>
          <span className="shrink-0 text-base font-semibold text-foreground">
            {formatPEN(course.priceCents)}
          </span>
        </div>
      </div>
    </Link>
  );
}
