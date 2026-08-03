import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { TiltCard } from "@/components/motion/tilt-card";
import { CourseCard } from "@/components/landing/course-card";
import type { CourseCard as CourseCardData } from "@/modules/catalog/queries";

export function FeaturedCourses({ courses }: { courses: CourseCardData[] }) {
  if (courses.length === 0) return null;

  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Catálogo
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-foreground sm:text-4xl">
              Cursos recientes
            </h2>
          </div>
          <Link
            href="/cursos"
            className="group inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Ver todos
            <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </Reveal>

        <Reveal
          stagger
          className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {courses.map((c) => (
            <TiltCard key={c.id}>
              <CourseCard course={c} />
            </TiltCard>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
