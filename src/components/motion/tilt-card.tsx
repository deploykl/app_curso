"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/motion";

/**
 * Inclinación 3D sutil que sigue al cursor, con brillo de foco. Solo con
 * puntero fino y movimiento permitido; en táctil o reduced-motion queda
 * como un contenedor inerte.
 */
export function TiltCard({
  children,
  className,
  strength = 8,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      const glow = glowRef.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
        const rotX = gsap.quickTo(el, "rotateX", { duration: 0.5, ease: "power3.out" });
        const rotY = gsap.quickTo(el, "rotateY", { duration: 0.5, ease: "power3.out" });
        const liftTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });

        const onMove = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          rotY((px - 0.5) * strength * 2);
          rotX((0.5 - py) * strength * 2);
          liftTo(-4);
          if (glow) {
            glow.style.setProperty("--x", `${px * 100}%`);
            glow.style.setProperty("--y", `${py * 100}%`);
            gsap.to(glow, { opacity: 1, duration: 0.3 });
          }
        };
        const onLeave = () => {
          rotX(0);
          rotY(0);
          liftTo(0);
          if (glow) gsap.to(glow, { opacity: 0, duration: 0.4 });
        };

        el.addEventListener("pointermove", onMove);
        el.addEventListener("pointerleave", onLeave);
        return () => {
          el.removeEventListener("pointermove", onMove);
          el.removeEventListener("pointerleave", onLeave);
        };
      });

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <div
      ref={ref}
      className={cn("relative [perspective:1000px] [transform-style:preserve-3d] will-change-transform", className)}
    >
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 [background:radial-gradient(220px_circle_at_var(--x,50%)_var(--y,50%),color-mix(in_oklch,var(--primary)_18%,transparent),transparent_70%)]"
      />
      {children}
    </div>
  );
}
