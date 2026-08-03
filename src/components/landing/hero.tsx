import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/magnetic";
import { AuroraBackground } from "@/components/landing/aurora-background";
import { LiveSessionWidget } from "@/components/landing/live-session-widget";
import type { NextLiveSession } from "@/modules/catalog/queries";

export function Hero({
  academiaName,
  highlights,
  nextSession,
}: {
  academiaName: string;
  highlights: string[];
  nextSession: NextLiveSession | null;
}) {
  const split = Boolean(nextSession);

  return (
    <section className="relative isolate overflow-hidden px-6 pt-20 pb-16 sm:pt-24 sm:pb-24">
      <AuroraBackground parallax />

      <div
        className={cn(
          "mx-auto max-w-6xl",
          split
            ? "grid items-center gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10"
            : "max-w-3xl text-center"
        )}
      >
        <Reveal immediate stagger>
          <p
            className={cn(
              "inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm",
              !split && "mx-auto"
            )}
          >
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

          <p
            className={cn(
              "mt-5 max-w-xl text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg",
              !split && "mx-auto"
            )}
          >
            En {academiaName} las clases son en directo con tu instructor. Te llevas los
            materiales, las grabaciones y un certificado con código público que cualquiera
            puede verificar.
          </p>

          <div
            className={cn(
              "mt-9 flex flex-col gap-3 sm:flex-row",
              split ? "items-start" : "items-center justify-center"
            )}
          >
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
            <ul
              className={cn(
                "mt-10 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground",
                !split && "justify-center"
              )}
            >
              {highlights.map((h, i) => (
                <li key={h} className="flex items-center gap-3">
                  {i > 0 && <span aria-hidden className="size-1 rounded-full bg-border" />}
                  {h}
                </li>
              ))}
            </ul>
          )}
        </Reveal>

        {nextSession && (
          <Reveal delay={0.15} y={24}>
            <LiveSessionWidget session={nextSession} />
          </Reveal>
        )}
      </div>
    </section>
  );
}
