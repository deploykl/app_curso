import Link from "next/link";
import { ArrowLeftIcon, BadgeCheckIcon, FileDownIcon, VideoIcon } from "lucide-react";
import { env } from "@/env";
import { BrandMark } from "@/components/landing/brand-mark";
import { AuroraBackground } from "@/components/landing/aurora-background";
import { ThemeToggle } from "@/components/theme-toggle";

const POINTS = [
  { icon: VideoIcon, text: "Clases en vivo por Zoom, en horario de Perú" },
  { icon: FileDownIcon, text: "Materiales y grabaciones de cada sesión" },
  { icon: BadgeCheckIcon, text: "Certificado con código público verificable" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      {/* Panel de marca: solo en pantallas anchas, decorativo respecto al formulario */}
      <aside className="relative isolate hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        <AuroraBackground className="[mask-image:linear-gradient(to_bottom,black_30%,transparent_95%)]" />

        <Link
          href="/"
          className="flex w-fit items-center gap-2.5 text-[0.95rem] font-semibold tracking-tight text-foreground"
        >
          <BrandMark />
          {env.ACADEMIA_NAME}
        </Link>

        <div>
          <h2 className="max-w-sm text-3xl font-bold tracking-[-0.025em] text-balance text-foreground">
            Aprende en vivo,{" "}
            <span className="text-gradient-brand">certifícate de verdad.</span>
          </h2>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="glass grid size-9 shrink-0 place-items-center rounded-lg text-primary">
                  <Icon className="size-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {env.ACADEMIA_NAME} · Precios en soles (PEN)
        </p>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-4" />
            Volver al inicio
          </Link>
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2.5 text-[0.95rem] font-semibold tracking-tight lg:hidden">
              <BrandMark />
              {env.ACADEMIA_NAME}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
