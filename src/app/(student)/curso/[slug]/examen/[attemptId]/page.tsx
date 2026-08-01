import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getIntentoParaResolver, cargarIntentoPropio } from "@/modules/assessment/queries";
import { cerrarIntento } from "@/modules/assessment/grading";
import { IntentoRunner } from "@/modules/assessment/ui/intento-runner";

export default async function IntentoPage({
  params,
}: {
  params: Promise<{ slug: string; attemptId: string }>;
}) {
  const { slug, attemptId } = await params;
  const u = await requireUser();

  let ctx;
  try {
    ctx = await cargarIntentoPropio(u.id, attemptId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!ctx || ctx.courseSlug !== slug) notFound();

  // Ya enviado: los resultados viven en su propia ruta.
  if (ctx.status === "submitted") {
    redirect(`/curso/${slug}/examen/${attemptId}/resultado`);
  }

  // El tiempo lo manda el servidor: un intento vencido se cierra y se califica
  // con lo que el alumno alcanzó a responder.
  // Server Component: leer el reloj en cada request es intencional, no una fuente de
  // inconsistencia de render.
  // eslint-disable-next-line react-hooks/purity
  if (ctx.expiresAt && Date.now() > ctx.expiresAt.getTime()) {
    await cerrarIntento(attemptId);
    redirect(`/curso/${slug}/examen/${attemptId}/resultado`);
  }

  const intento = await getIntentoParaResolver(u.id, attemptId);
  if (!intento) notFound();

  return (
    <IntentoRunner
      attemptId={intento.attemptId}
      courseSlug={intento.courseSlug}
      courseTitle={intento.courseTitle}
      examTitle={intento.examTitle}
      expiresAtISO={intento.expiresAt ? intento.expiresAt.toISOString() : null}
      preguntas={intento.preguntas.map((p) => ({
        id: p.id,
        numero: p.numero,
        promptMd: p.promptMd,
        points: p.points,
        opciones: p.opciones,
        seleccionadaId: p.seleccionadaId,
      }))}
    />
  );
}
