import { EventEmitter } from "node:events";

/*
  Bus de eventos en memoria para notificaciones en tiempo real (SSE). Vive en
  el proceso del servidor Next.js — funciona porque el despliegue es un solo
  nodo (no hay Redis en este proyecto). Si algún día se escala a varias
  instancias, esto necesitará un pub/sub externo (Redis, etc).

  `globalThis` evita que el hot-reload de `next dev` cree una instancia nueva
  en cada recarga y pierda los listeners activos.
*/
declare global {
  var __appEventBus: EventEmitter | undefined;
}

export const eventBus: EventEmitter = globalThis.__appEventBus ?? new EventEmitter();
if (!globalThis.__appEventBus) {
  eventBus.setMaxListeners(0);
  globalThis.__appEventBus = eventBus;
}

export const PAYMENT_PROOF_SUBMITTED = "payment-proof-submitted";

export function orderUpdatedEvent(orderNumber: string): string {
  return `order-updated:${orderNumber}`;
}
