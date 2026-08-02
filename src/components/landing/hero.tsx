import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/magnetic";
import { AuroraBackground } from "@/components/landing/aurora-background";

export function Hero({
  academiaName,
  highlights,
}: {
  academiaName: string;
  highlights: string[];
}) {
  return (
    <section className="relative isolate overflow-hidden px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
      <AuroraBackground parallax />

      <Reveal immediate stagger className="mx-auto max-w-3xl text-center">
        <p className="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <span className="relative grid size-2 place-items-center">
            <span className="absolute size-2 rounded-full bg-chart-2 animate-pulse-glow" />
            <span className="size-2 rounded-full bg-chart-2" />
          </span>
          Clases en vivo por Zoom, en horario de Perú
        </p>

        <h1 className="mt-6 text-4xl font-bold tracking-[-0.03em] text-balance text-foreground sm:text-6xl">
          Aprende en vivo,
          <br />
          <span className="text-gradient-brand">certifícate de verdad.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">
          En {academiaName} las clases son en directo con tu instructor. Te llevas los
          materiales, las grabaciones y un certificado con código público que cualquiera
          puede verificar.
        </p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Magnetic className="w-full sm:w-auto">
            <Link href="/cursos" className={buttonVariants({ size: "xl", className: "w-full sm:w-auto" })}>
              Ver cursos
              <ArrowRightIcon className="size-4.5" />
            </Link>
          </Magnetic>
          <Link
            href="#como-funciona"
            className={buttonVariants({
              variant: "outline",
              size: "xl",
              className: "w-full sm:w-auto",
            })}
          >
            Cómo funciona
          </Link>
        </div>

        {highlights.length > 0 && (
          <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
            {highlights.map((h, i) => (
              <li key={h} className="flex items-center gap-3">
                {i > 0 && <span aria-hidden className="size-1 rounded-full bg-border" />}
                {h}
              </li>
            ))}
          </ul>
        )}
      </Reveal>
    </section>
  );
}
