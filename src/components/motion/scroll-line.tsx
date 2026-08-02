"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { MOTION_OK, gsap } from "@/lib/motion";

/**
 * Línea conectora que se "dibuja" mientras la sección atraviesa el viewport.
 * Con movimiento reducido queda dibujada al 100% de entrada.
 */
export function ScrollLine({
  axis = "x",
  className,
}: {
  axis?: "x" | "y";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const prop = axis === "x" ? "scaleX" : "scaleY";
        gsap.fromTo(
          el,
          { [prop]: 0 },
          {
            [prop]: 1,
            ease: "none",
            scrollTrigger: {
              trigger: el.parentElement ?? el,
              start: "top 75%",
              end: "bottom 70%",
              scrub: 0.5,
            },
          }
        );
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [axis] }
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute bg-gradient-to-r from-primary/50 via-primary/25 to-transparent",
        axis === "x" ? "origin-left" : "origin-top bg-gradient-to-b",
        className
      )}
    />
  );
}
