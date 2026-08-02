import { Reveal } from "@/components/motion/reveal";
import { ScrollLine } from "@/components/motion/scroll-line";
import { SectionHeading } from "@/components/landing/section-heading";
import { STEPS } from "@/content/landing";

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Cómo funciona"
          title="De la primera clase al certificado"
          description="Cuatro pasos, sin letra pequeña: asistes en vivo, te llevas el material, rindes el examen y obtienes tu certificado."
        />

        <div className="relative mt-14">
          {/* Conectores: horizontal en escritorio, vertical en móvil */}
          <ScrollLine axis="x" className="top-6 right-8 left-8 hidden h-px lg:block" />
          <ScrollLine axis="y" className="top-8 bottom-8 left-6 w-px lg:hidden" />

          <Reveal
            stagger
            className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6"
          >
            {STEPS.map(({ icon: Icon, title, description }, i) => (
              <div key={title} className="relative pl-16 lg:pl-0">
                <span className="glass absolute top-0 left-0 grid size-12 place-items-center rounded-xl text-primary lg:relative lg:size-12">
                  <Icon className="size-5" />
                </span>
                <div className="lg:mt-5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-1 font-semibold tracking-tight text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
