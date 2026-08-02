import { Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "start";
  className?: string;
}) {
  return (
    <Reveal
      stagger
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className
      )}
    >
      {eyebrow && (
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-3 text-3xl font-bold tracking-[-0.025em] text-balance text-foreground sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </Reveal>
  );
}
