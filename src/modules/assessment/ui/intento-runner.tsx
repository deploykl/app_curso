"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

  const actual = preguntas[indice];
  const respondidas = preguntas.filter((p) => respuestas[p.id]).length;

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
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">{examTitle}</h1>
          <p className="text-sm text-muted-foreground">{courseTitle}</p>
        </div>
        {expiresAtISO && <CuentaRegresiva expiresAtISO={expiresAtISO} />}
      </div>

      <p className="text-sm text-muted-foreground">
        Pregunta {actual.numero} de {preguntas.length} · {respondidas} respondidas
      </p>

      <div className="flex flex-col gap-4 rounded-md border border-border p-4">
        <p className="font-medium">{actual.promptMd}</p>
        <ul className="flex flex-col gap-2">
          {actual.opciones.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3 hover:bg-muted">
                <input
                  type="radio"
                  name={`pregunta-${actual.id}`}
                  checked={respuestas[actual.id] === o.id}
                  onChange={() => elegir(actual.id, o.id)}
                />
                <span>{o.text}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="h-4 text-xs text-muted-foreground">
          {guardando === actual.id ? "Guardando..." : respuestas[actual.id] ? "✓ guardado" : ""}
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Ir a una pregunta">
        {preguntas.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setIndice(i)}
            aria-current={i === indice ? "true" : undefined}
            className={
              i === indice
                ? "size-9 rounded-md border border-primary bg-primary text-sm text-primary-foreground"
                : respuestas[p.id]
                  ? "size-9 rounded-md border border-primary text-sm"
                  : "size-9 rounded-md border border-border text-sm text-muted-foreground"
            }
          >
            {p.numero}
          </button>
        ))}
      </nav>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={indice === 0}
          onClick={() => setIndice((i) => i - 1)}
        >
          ‹ Anterior
        </Button>

        {indice < preguntas.length - 1 ? (
          <Button type="button" onClick={() => setIndice((i) => i + 1)}>
            Siguiente ›
          </Button>
        ) : (
          <Button type="button" disabled={isPending} onClick={enviar}>
            {isPending ? "Enviando..." : "Enviar examen"}
          </Button>
        )}
      </div>

      {respondidas < preguntas.length && indice === preguntas.length - 1 && (
        <p className="text-sm text-muted-foreground">
          Te faltan {preguntas.length - respondidas} preguntas por responder. Si envías ahora,
          contarán como incorrectas.
        </p>
      )}
    </div>
  );
}
