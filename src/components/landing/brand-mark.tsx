import { cn } from "@/lib/utils";

/**
 * Marca provisional: no hay logo en el repo y el nombre de la academia todavía
 * es un placeholder de entorno (ACADEMIA_NAME). Un birrete geométrico simple
 * construido con el índigo de marca, que funciona en claro y en oscuro.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_4px_14px_-6px_var(--primary)]",
        className
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-4.5">
        <path
          d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4Z"
          fill="currentColor"
          fillOpacity="0.95"
        />
        <path
          d="M6 11v4.2c0 .6.33 1.15.86 1.42C8.2 17.3 10 18 12 18s3.8-.7 5.14-1.38c.53-.27.86-.82.86-1.42V11"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          fillOpacity="0"
        />
      </svg>
    </span>
  );
}
