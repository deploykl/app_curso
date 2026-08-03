"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import { ArrowRightIcon, CalendarClockIcon, RadioIcon } from "lucide-react";
import { formatLima } from "@/lib/datetime";
import { gsap, MOTION_OK } from "@/lib/motion";
import type { NextLiveSession } from "@/modules/catalog/queries";

/**
 * Vitrina de la próxima clase en vivo real (no una maqueta): convierte "en
 * vivo" en un dato concreto en vez de un adjetivo del copy. Flota suavemente
 * como si fuera una notificación en pantalla — la única animación idle del
 * hero, para no competir con el aurora de fondo.
 */
export function LiveSessionWidget({ session }: { session: NextLiveSession }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const float = gsap.to(el, {
          y: -10,
          duration: 3.2,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
        });
        return () => {
          float.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: ref }
  );

  return (
    <div ref={ref} className="glass relative overflow-hidden rounded-3xl p-6 will-change-transform sm:p-7">
      <div className="shimmer-line animate-shimmer absolute inset-x-0 top-0 h-px" />

      <div className="flex items-center gap-2">
        <span className="relative grid size-2.5 place-items-center">
          <span className="absolute size-2.5 rounded-full bg-chart-2 animate-pulse-glow" />
          <span className="size-2.5 rounded-full bg-chart-2" />
        </span>
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Próxima clase en vivo
        </p>
      </div>

      <p className="mt-4 text-lg leading-snug font-semibold tracking-tight text-balance text-foreground">
        {session.sessionTitle}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{session.courseTitle}</p>

      <div className="mt-5 flex flex-col gap-2.5 border-t border-border/70 pt-5 text-sm">
        <span className="inline-flex items-center gap-2 text-foreground">
          <CalendarClockIcon className="size-4 shrink-0 text-primary" />
          {formatLima(session.startsAt)}
        </span>
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <RadioIcon className="size-4 shrink-0 text-primary" />
          Con {session.instructorName} · {session.durationMinutes} min
        </span>
      </div>

      <Link
        href={`/cursos/${session.courseSlug}`}
        className="group mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Reservar mi cupo
        <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
