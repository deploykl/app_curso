import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { TESTIMONIALS } from "@/content/landing";

export function Testimonials() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Alumnos"
          title="Lo que cuentan quienes ya se certificaron"
        />

        <Reveal stagger className="mt-14 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="glass flex flex-col rounded-2xl p-7">
              <blockquote className="flex-1 text-sm leading-relaxed text-pretty text-foreground/90">
                «{t.quote}»
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-border/60 pt-5">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/12 text-sm font-semibold text-primary"
                >
                  {t.name.charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
