import type { EventEmitter } from "node:events";

/** Arma un stream SSE que reenvía los eventos `eventName` de `bus` al cliente, con heartbeat cada 25s. */
export function sseStream(bus: EventEmitter, eventName: string): Response {
  const encoder = new TextEncoder();
  let onEvent: (payload: unknown) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // El controlador ya se cerró (cliente desconectado); nada que hacer.
        }
      };
      onEvent = (payload) => send(payload);
      bus.on(eventName, onEvent);
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25_000);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off(eventName, onEvent);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
