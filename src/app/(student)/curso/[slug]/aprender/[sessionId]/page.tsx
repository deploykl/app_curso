import { notFound } from "next/navigation";
import { requireUser } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/auth/guards";
import { getSessionDetail } from "@/modules/learning/queries";
import { attendanceButtonLabel } from "@/modules/learning/service";
import { formatLima } from "@/lib/datetime";
import { MarcarProgresoButton } from "@/modules/learning/ui/marcar-progreso-button";
import { DescargarMaterialButton } from "@/modules/learning/ui/descargar-material-button";

export default async function SesionPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { sessionId } = await params;
  const u = await requireUser();

  let session;
  try {
    session = await getSessionDetail(u.id, sessionId);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  if (!session) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{session.courseTitle}</p>
        <h1 className="text-2xl font-semibold">{session.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatLima(session.startsAt)}</p>
      </div>

      {session.state === "live" && session.zoomUrl && (
        <a
          href={session.zoomUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Entrar a la clase (Zoom)
        </a>
      )}
      {session.state === "live" && !session.zoomUrl && (
        <p className="text-sm text-muted-foreground">
          La clase está en vivo, pero aún no se registró el enlace de Zoom.
        </p>
      )}
      {session.state === "upcoming" && session.zoomUrl && (
        <p className="text-sm text-muted-foreground">
          El enlace de Zoom se habilita 10 minutos antes de la clase.
        </p>
      )}
      {session.state === "upcoming" && !session.zoomUrl && (
        <p className="text-sm text-muted-foreground">
          El enlace de Zoom aún no está disponible para esta clase.
        </p>
      )}
      {session.state === "past" && session.recordingUrl && (
        <a
          href={session.recordingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block w-fit rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Ver grabación
        </a>
      )}
      {session.state === "past" && !session.recordingUrl && (
        <p className="text-sm text-muted-foreground">La grabación aún no está disponible.</p>
      )}

      {session.materials.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="font-medium">Materiales</h2>
          {session.materials.map((m) => (
            <DescargarMaterialButton key={m.id} materialId={m.id} title={m.title} />
          ))}
        </div>
      )}

      <MarcarProgresoButton
        sessionId={session.id}
        label={attendanceButtonLabel(session.state)}
        alreadyMarked={session.attended}
      />
    </div>
  );
}
