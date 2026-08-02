"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { DUR, EASE, MOTION_OK, REVEAL_START, STAGGER, gsap } from "@/lib/motion";

interface RevealProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Retraso extra antes de la entrada, en segundos. */
  delay?: number;
  /** Desplazamiento vertical inicial, en px. */
  y?: number;
  /** Anima los hijos directos en cascada en lugar del contenedor completo. */
  stagger?: boolean;
  /** Dispara al montar en vez de al entrar en viewport (para contenido above the fold). */
  immediate?: boolean;
  id?: string;
}

/**
 * Entrada sutil (fade + subida) al entrar en viewport, una sola vez.
 *
 * El estado inicial vive en globals.css bajo `prefers-reduced-motion: no-preference`,
 * así que con movimiento reducido —o si el JS no llega a ejecutarse— el contenido
 * se ve exactamente como lo renderizó el servidor y este componente no hace nada.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
  delay = 0,
  y = 16,
  stagger = false,
  immediate = false,
  id,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const targets = stagger ? Array.from(el.children) : el;

        gsap.fromTo(
          targets,
          { opacity: 0, y },
          {
            opacity: 1,
            y: 0,
            duration: DUR,
            ease: EASE,
            delay,
            stagger: stagger ? STAGGER : 0,
            scrollTrigger: immediate
              ? undefined
              : { trigger: el, start: REVEAL_START, once: true },
          }
        );
      });

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <Tag
      ref={ref}
      id={id}
      data-reveal={stagger ? "stagger" : "item"}
      className={cn(className)}
    >
      {children}
    </Tag>
  );
}
