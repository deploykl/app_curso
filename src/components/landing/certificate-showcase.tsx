import { CheckCircle2Icon, QrCodeIcon, ShieldCheckIcon } from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { VerifyCodeForm } from "@/components/landing/verify-code-form";

const DEMO_CODE = "K7M4-P2XR";

const POINTS = [
  {
    icon: ShieldCheckIcon,
    title: "Imposible de falsificar a ojo",
    text: "Cada certificado lleva un código único emitido por la plataforma, no un PDF que se pueda editar.",
  },
  {
    icon: QrCodeIcon,
    title: "Se valida en un segundo",
    text: "Quien lo reciba escanea el QR o escribe el código en la web y ve al instante si es auténtico.",
  },
  {
    icon: CheckCircle2Icon,
    title: "Siempre al día",
    text: "Si un curso se reembolsa, el certificado queda revocado y la verificación lo refleja.",
  },
];

/** Patrón determinista: decorativo, no codifica nada. */
function QrArt() {
  const size = 11;
  const cells: { x: number; y: number }[] = [];
  const isFinder = (x: number, y: number) =>
    (x < 3 && y < 3) || (x > size - 4 && y < 3) || (x < 3 && y > size - 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (isFinder(x, y)) continue;
      if ((x * 7 + y * 13 + x * y) % 5 < 2) cells.push({ x, y });
    }
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-full" aria-hidden>
      {[
        [0, 0],
        [size - 3, 0],
        [0, size - 3],
      ].map(([fx, fy]) => (
        <g key={`${fx}-${fy}`}>
          <rect
            x={fx}
            y={fy}
            width="3"
            height="3"
            rx="0.7"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.55"
          />
          <rect x={fx + 1.1} y={fy + 1.1} width="0.8" height="0.8" fill="currentColor" />
        </g>
      ))}
      {cells.map(({ x, y }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="0.8" height="0.8" rx="0.15" fill="currentColor" />
      ))}
    </svg>
  );
}

export function CertificateShowcase({ academiaName }: { academiaName: string }) {
  return (
    <section id="certificado" className="scroll-mt-24 px-6 py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <Reveal stagger>
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Certificado verificable
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-balance text-foreground sm:text-4xl">
              Un código que tu empleador puede comprobar solo
            </h2>
            <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
              Al aprobar el examen final emitimos tu certificado con un código público y un
              QR. No hace falta que envíes nada ni que nadie nos escriba: la verificación es
              una página abierta.
            </p>
          </Reveal>

          <Reveal stagger className="mt-8 space-y-5">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3.5">
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </div>
            ))}
          </Reveal>

          <Reveal className="mt-9">
            <VerifyCodeForm />
            <p className="mt-2.5 text-xs text-muted-foreground">
              ¿Tienes un certificado a mano? Escribe su código y compruébalo ahora.
            </p>
          </Reveal>
        </div>

        <Reveal y={28} className="relative">
          {/* Resplandor detrás de la tarjeta */}
          <div
            aria-hidden
            className="absolute inset-8 -z-10 rounded-full bg-primary/25 blur-3xl dark:bg-primary/20"
          />

          <div className="glass relative overflow-hidden rounded-3xl p-8 sm:p-10">
            <div className="shimmer-line animate-shimmer absolute inset-x-0 top-0 h-px" />

            <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
              {academiaName}
            </p>
            <p className="mt-6 text-xs tracking-wide text-muted-foreground">
              Certificado de aprobación otorgado a
            </p>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
              Rosa Quispe Mamani
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              por completar y aprobar el curso
            </p>
            <p className="mt-1 text-base font-medium text-foreground">Excel desde cero</p>

            <div className="mt-8 flex items-end justify-between gap-6 border-t border-border/70 pt-6">
              <div>
                <p className="text-[0.7rem] tracking-wide text-muted-foreground uppercase">
                  Código de verificación
                </p>
                <Reveal
                  stagger
                  y={0}
                  className="mt-1.5 flex font-mono text-xl font-semibold tracking-[0.18em] text-primary"
                >
                  {DEMO_CODE.split("").map((ch, i) => (
                    <span key={`${ch}-${i}`}>{ch}</span>
                  ))}
                </Reveal>
              </div>
              <div className="size-20 shrink-0 text-foreground/80">
                <QrArt />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
