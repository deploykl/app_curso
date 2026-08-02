"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { MOTION_OK, gsap } from "@/lib/motion";

export interface Stat {
  value: number;
  label: string;
  suffix?: string;
}

const nf = new Intl.NumberFormat("es-PE");

/**
 * Banda de social proof. Las cifras llegan ya filtradas por STATS_FLOOR desde
 * el servidor, así que si aparece una métrica es porque tiene volumen real.
 * El HTML ya trae el número final: la animación solo lo cuenta desde cero.
 */
export function StatsBand({ stats }: { stats: Stat[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        el.querySelectorAll<HTMLElement>("[data-count]").forEach((node) => {
          const end = Number(node.dataset.count);
          if (!Number.isFinite(end)) return;
          const counter = { v: 0 };

          gsap.to(counter, {
            v: end,
            duration: 1.6,
            ease: "power2.out",
            onUpdate: () => {
              node.textContent = nf.format(Math.round(counter.v));
            },
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          });
        });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [stats] }
  );

  if (stats.length === 0) return null;

  return (
    <section className="px-6 py-12">
      <div
        ref={ref}
        className={cn(
          "glass mx-auto grid max-w-5xl grid-cols-1 gap-8 rounded-3xl px-8 py-10",
          // Mientras la plataforma arranca puede quedar visible una sola cifra:
          // la rejilla se ajusta para que no aparezca descentrada.
          stats.length === 2 && "sm:grid-cols-2",
          stats.length >= 3 && "sm:grid-cols-3"
        )}
      >
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
              <span data-count={s.value}>{nf.format(s.value)}</span>
              {s.suffix}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
