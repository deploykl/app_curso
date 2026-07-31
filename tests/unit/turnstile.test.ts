import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTurnstile } from "@/lib/turnstile";

afterEach(() => vi.restoreAllMocks());

describe("verifyTurnstile", () => {
  it("devuelve true cuando Cloudflare responde success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true })));
    expect(await verifyTurnstile("token-ok")).toBe(true);
  });

  it("devuelve false cuando responde error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ success: false, "error-codes": ["invalid-input-response"] })
    ));
    expect(await verifyTurnstile("token-malo")).toBe(false);
  });

  it("devuelve false si el token viene vacío, sin llamar a la red", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await verifyTurnstile("")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("devuelve false si la red falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await verifyTurnstile("token")).toBe(false);
  });
});
