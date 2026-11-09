import { describe, expect, it } from "vitest";
import { anySignal, installAbortSignalAny, isWebKit } from "./abortSignalAny";

describe("AbortSignal.any que no se pierde", () => {
  it("se cancela cuando una de las señales se cancela después", () => {
    const a = new AbortController();
    const b = new AbortController();
    const any = anySignal([a.signal, b.signal]);
    expect(any.aborted).toBe(false);
    b.abort("listo");
    expect(any.aborted).toBe(true);
    expect(any.reason).toBe("listo");
  });

  it("nace cancelada si una ya lo estaba", () => {
    const a = new AbortController();
    a.abort("antes");
    const any = anySignal([new AbortController().signal, a.signal]);
    expect(any.aborted).toBe(true);
    expect(any.reason).toBe("antes");
  });

  it("quita el escucha registrado con ella", () => {
    // pdf.js: window.addEventListener("keyup", …, { signal: AbortSignal.any([…]) }).
    const owner = new AbortController();
    const target = new EventTarget();
    let calls = 0;
    target.addEventListener("keyup", () => calls++, {
      signal: anySignal([owner.signal, new AbortController().signal]),
    });
    target.dispatchEvent(new Event("keyup"));
    owner.abort();
    target.dispatchEvent(new Event("keyup"));
    expect(calls).toBe(1);
  });

  it("al cancelarse deja de escuchar a las demás", () => {
    // A long-lived signal combined many times must not keep one listener per combination.
    const longLived = new AbortController();
    const added: number[] = [];
    const signal = longLived.signal;
    const add = signal.addEventListener.bind(signal);
    let live = 0;
    signal.addEventListener = ((
      type: string,
      fn: EventListener,
      opts?: AddEventListenerOptions,
    ) => {
      live++;
      added.push(live);
      opts?.signal?.addEventListener("abort", () => live--);
      return add(type, fn, opts);
    }) as typeof signal.addEventListener;
    for (let i = 0; i < 50; i++) {
      const short = new AbortController();
      anySignal([signal, short.signal]);
      short.abort();
    }
    expect(live).toBe(0);
  });

  it("solo se instala en WebKit", () => {
    const fake = { any: () => "nativa" } as unknown as typeof AbortSignal;
    installAbortSignalAny(fake, false);
    expect((fake.any as () => string)()).toBe("nativa");
    installAbortSignalAny(fake, true);
    expect(fake.any).toBe(anySignal);
  });

  it("reconoce WebKit por el agente de usuario", () => {
    const gtk =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    const edge =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36 Edg/156.0.0.0";
    expect(isWebKit(gtk)).toBe(true);
    expect(isWebKit(edge)).toBe(false);
    expect(isWebKit("Mozilla/5.0 (X11; Linux x86_64; rv:150.0) Gecko/20100101 Firefox/150.0")).toBe(
      false,
    );
  });
});
