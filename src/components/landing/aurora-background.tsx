"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { MOTION_OK, gsap } from "@/lib/motion";

/**
 * Halos de gradiente difusos detrás del contenido. Decorativo: aria-hidden,
 * sin eventos de puntero y por debajo del contenido (la sección padre debe
 * llevar `relative isolate`).
 */
export function AuroraBackground({
  className,
  parallax = false,
}: {
  className?: string;
  parallax?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || !parallax) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.to(el, {
          yPercent: 14,
          ease: "none",
          scrollTrigger: {
            trigger: el.parentElement ?? el,
            start: "top top",
            end: "bottom top",
            scrub: 0.6,
          },
        });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [parallax] }
  );

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
        "[mask-image:linear-gradient(to_bottom,black_50%,transparent_100%)]",
        className
      )}
    >
      <div className="aurora-blob animate-aurora-drift top-[-18rem] left-[-6rem] size-[34rem] bg-primary sm:left-[8%]" />
      <div className="aurora-blob animate-aurora-drift top-[-10rem] right-[-8rem] size-[30rem] bg-chart-2 [animation-delay:-6s] sm:right-[6%]" />
      <div className="aurora-blob animate-aurora-drift top-[6rem] left-[38%] size-[26rem] bg-chart-4 [animation-delay:-11s]" />
    </div>
  );
}
