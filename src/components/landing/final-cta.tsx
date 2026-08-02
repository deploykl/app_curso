import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { Magnetic } from "@/components/motion/magnetic";
import { AuroraBackground } from "@/components/landing/aurora-background";

export function FinalCta() {
  return (
    <section className="px-6 pb-8">
      <div className="glass relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl px-6 py-20 text-center sm:px-16">
        <AuroraBackground className="[mask-image:radial-gradient(closest-side,black,transparent)]" />

        <Reveal stagger className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-[-0.025em] text-balance text-foreground sm:text-4xl">
            Tu próxima clase en vivo empieza esta semana
          </h2>
          <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
            Elige un curso, paga con Yape, Plin o transferencia y entra al aula en cuanto
            confirmemos tu pago.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Magnetic className="w-full sm:w-auto">
              <Link
                href="/cursos"
                className={buttonVariants({ size: "xl", className: "w-full sm:w-auto" })}
              >
                Explorar cursos
                <ArrowRightIcon className="size-4.5" />
              </Link>
            </Magnetic>
            <Link
              href="/registro"
              className={buttonVariants({
                variant: "outline",
                size: "xl",
                className: "w-full sm:w-auto",
              })}
            >
              Crear cuenta gratis
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
