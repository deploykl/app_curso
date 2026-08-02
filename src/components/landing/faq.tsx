"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/landing/section-heading";
import { FAQ as FAQ_ITEMS } from "@/content/landing";

export function Faq() {
  return (
    <section id="preguntas" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="Preguntas frecuentes" title="Lo que suelen preguntarnos" />

        <Reveal className="glass mt-12 rounded-2xl px-6 py-2">
          <Accordion>
            {FAQ_ITEMS.map((item) => (
              <AccordionItem key={item.question} value={item.question}>
                <AccordionTrigger className="py-5 text-base font-medium text-balance hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="pb-5 text-sm leading-relaxed text-muted-foreground">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
