"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/** Registro idempotente: gsap.registerPlugin es seguro de llamar varias veces. */
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/** Curva y tiempos compartidos por todo el landing, para que las entradas se sientan iguales. */
export const EASE = "power3.out";
export const DUR = 0.75;
export const STAGGER = 0.09;

/** Media query que usan todas las animaciones vía gsap.matchMedia(). */
export const MOTION_OK = "(prefers-reduced-motion: no-preference)";

/** Punto en el que un elemento entra en viewport y dispara su reveal. */
export const REVEAL_START = "top 85%";

export { gsap, ScrollTrigger };
