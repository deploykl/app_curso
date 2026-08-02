import { env } from "@/env";
import { getLandingStats, listPublishedCourses } from "@/modules/catalog/queries";
import { STATS_FLOOR } from "@/content/landing";
import { Hero } from "@/components/landing/hero";
import { PaymentStrip } from "@/components/landing/payment-strip";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeaturedCourses } from "@/components/landing/featured-courses";
import { CertificateShowcase } from "@/components/landing/certificate-showcase";
import { StatsBand, type Stat } from "@/components/landing/stats-band";
import { Testimonials } from "@/components/landing/testimonials";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";

// El landing se prerenderiza; sin esto las cifras y los cursos quedarían
// congelados en el momento del build.
export const revalidate = 3600;

export default async function LandingPage() {
  const [cursos, stats] = await Promise.all([listPublishedCourses({}), getLandingStats()]);
  const recientes = cursos.slice(0, 3);

  // Solo publicamos una cifra cuando tiene volumen suficiente para decir algo:
  // ver STATS_FLOOR en src/content/landing.ts.
  const visibleStats: Stat[] = [
    { key: "students", value: stats.students, label: "Alumnos matriculados", suffix: "+" },
    { key: "courses", value: stats.courses, label: "Cursos en vivo publicados" },
    { key: "certificates", value: stats.certificates, label: "Certificados emitidos", suffix: "+" },
  ]
    .filter((s) => s.value >= STATS_FLOOR[s.key as keyof typeof STATS_FLOOR])
    .map(({ value, label, suffix }) => ({ value, label, suffix }));

  const highlights = visibleStats.slice(0, 2).map((s) => `${s.value}${s.suffix ?? ""} ${s.label.toLowerCase()}`);

  return (
    <>
      <Hero academiaName={env.ACADEMIA_NAME} highlights={highlights} />
      <PaymentStrip />
      <HowItWorks />
      <FeaturedCourses courses={recientes} />
      <CertificateShowcase academiaName={env.ACADEMIA_NAME} />
      <StatsBand stats={visibleStats} />
      <Testimonials />
      <Faq />
      <FinalCta />
    </>
  );
}
