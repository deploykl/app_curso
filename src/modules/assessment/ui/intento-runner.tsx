"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { responder, enviarIntento } from "@/modules/assessment/actions";
import { CuentaRegresiva } from "./cuenta-regresiva";

export interface PreguntaRunner {
  id: string;
  numero: number;
  promptMd: string;
  points: number;
  opciones: { id: string; text: string }[];
  seleccionadaId: string | null;
}

export function IntentoRunner({
  attemptId,
  courseSlug,
  examTitle,
  courseTitle,
  expiresAtISO,
  preguntas,
}: {
  attemptId: string;
  courseSlug: string;
  examTitle: string;
  courseTitle: string;
  expiresAtISO: string | null;
  preguntas: PreguntaRunner[];
}) {
  const router = useRouter();
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(preguntas.map((p) => [p.id, p.seleccionadaId]))
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  if (preguntas.length === 0) {
    return <p className="text-muted-foreground">Este examen no tiene preguntas.</p>;
  }

  const actual = preguntas[indice];
  const respondidas = preguntas.filter((p) => respuestas[p.id]).length;
  const percent = Math.round((respondidas / preguntas.length) * 100);

  function elegir(questionId: string, optionId: string) {
    const previo = respuestas[questionId] ?? null;
    setRespuestas((r) => ({ ...r, [questionId]: optionId }));
    setGuardando(questionId);
    setError("");

    responder(attemptId, questionId, optionId)
      .then(() => setGuardando(null))
      .catch((err) => {
        setRespuestas((r) => ({ ...r, [questionId]: previo }));
        setGuardando(null);
        const message = err instanceof Error ? err.message : "No pudimos guardar tu respuesta.";
        setError(message);
        toast.error(message);
      });
  }

  function enviar() {
    setError("");
    startTransition(async () => {
      try {
        await enviarIntento(attemptId);
        router.push(`/curso/${courseSlug}/examen/${attemptId}/resultado`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "No pudimos enviar tu examen.";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {courseTitle}
            </p>
            <h1 className="text-xl font-semibold tracking-tight">{examTitle}</h1>
          </div>
          {expiresAtISO && <CuentaRegresiva expiresAtISO={expiresAtISO} />}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Pregunta {actual.numero} de {preguntas.length}
            </span>
            <span>{respondidas} de {preguntas.length} respondidas</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <p className="text-base font-medium leading-relaxed text-balance">{actual.promptMd}</p>
        <ul className="flex flex-col gap-2">
          {actual.opciones.map((o) => {
            const seleccionada = respuestas[actual.id] === o.id;
            return (
              <li key={o.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors ${
                    seleccionada
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name={`pregunta-${actual.id}`}
                    checked={seleccionada}
                    onChange={() => elegir(actual.id, o.id)}
                    className="sr-only"
                  />
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${
                      seleccionada ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {seleccionada && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="text-sm">{o.text}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="h-4 text-xs text-muted-foreground">
          {guardando === actual.id ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" />
              Guardando...
            </span>
          ) : respuestas[actual.id] ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Check className="size-3.5" strokeWidth={3} />
              Guardado
            </span>
          ) : (
            ""
          )}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Ir a una pregunta">
        {preguntas.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIndice(i)}
            aria-current={i === indice ? "true" : undefined}
            className={`grid size-9 place-items-center rounded-lg border text-sm font-medium transition-colors ${
              i === indice
                ? "border-primary bg-primary text-primary-foreground"
                : respuestas[p.id]
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {p.numero}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {respondidas < preguntas.length && indice === preguntas.length - 1 && (
        <div className="flex items-center gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-sm text-warning-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          Te faltan {preguntas.length - respondidas} pregunta{preguntas.length - respondidas === 1 ? "" : "s"} por
          responder. Si envías ahora, contarán como incorrectas.
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={indice === 0}
          onClick={() => setIndice((i) => i - 1)}
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Button>

        {indice < preguntas.length - 1 ? (
          <Button type="button" onClick={() => setIndice((i) => i + 1)}>
            Siguiente
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button type="button" disabled={isPending} onClick={enviar}>
            {isPending ? "Enviando..." : "Enviar examen"}
          </Button>
        )}
      </div>
    </div>
  );
}
