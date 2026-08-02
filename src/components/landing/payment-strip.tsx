import { Reveal } from "@/components/motion/reveal";
import { PAYMENT_METHODS } from "@/content/landing";

export function PaymentStrip() {
  return (
    <section className="px-6">
      <Reveal
        className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4"
      >
        {PAYMENT_METHODS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-3 bg-background px-5 py-4 text-sm font-medium text-muted-foreground"
          >
            <Icon className="size-4 shrink-0 text-primary" />
            <span className="text-pretty">{label}</span>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
