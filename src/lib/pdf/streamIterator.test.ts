import { describe, expect, it } from "vitest";
import { installStreamIterator } from "./streamIterator";

/** A stream class without async iteration, like WebKit's before Safari 26. */
class OldStream {
  constructor(private readonly chunks: number[]) {}
  getReader() {
    const chunks = [...this.chunks];
    return {
      read: async () =>
        chunks.length ? { done: false, value: chunks.shift() } : { done: true, value: undefined },
      releaseLock: () => {},
    };
  }
}

describe("installStreamIterator", () => {
  it("permite recorrer con for await un stream que no lo traía", async () => {
    installStreamIterator(OldStream.prototype);
    const seen: number[] = [];
    for await (const chunk of new OldStream([1, 2, 3]) as unknown as AsyncIterable<number>) {
      seen.push(chunk);
    }
    expect(seen).toEqual([1, 2, 3]);
  });

  it("no toca uno que ya lo tiene", () => {
    const own = async function* () {};
    const proto = { [Symbol.asyncIterator]: own };
    installStreamIterator(proto);
    expect(proto[Symbol.asyncIterator]).toBe(own);
  });
});
