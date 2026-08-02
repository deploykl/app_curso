"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { gsap } from "@/lib/motion";

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** Cuánto se desplaza como máximo hacia el cursor, en px. */
  strength?: number;
}

/**
 * Atracción sutil hacia el cursor. Solo con puntero fino (ratón) y movimiento
 * permitido; en táctil y con reduced-motion es un <span> inerte.
 */
export function Magnetic({ children, className, strength = 6 }: MagneticProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(
        "(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)",
        () => {
          const xTo = gsap.quickTo(el, "x", { duration: 0.45, ease: "power3.out" });
          const yTo = gsap.quickTo(el, "y", { duration: 0.45, ease: "power3.out" });

          const onMove = (e: PointerEvent) => {
            const r = el.getBoundingClientRect();
            xTo(((e.clientX - (r.left + r.width / 2)) / r.width) * strength * 2);
            yTo(((e.clientY - (r.top + r.height / 2)) / r.height) * strength * 2);
          };
          const onLeave = () => {
            xTo(0);
            yTo(0);
          };

          el.addEventListener("pointermove", onMove);
          el.addEventListener("pointerleave", onLeave);
          return () => {
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerleave", onLeave);
          };
        }
      );

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <span ref={ref} className={cn("inline-block will-change-transform", className)}>
      {children}
    </span>
  );
}
