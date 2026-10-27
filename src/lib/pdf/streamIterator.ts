/**
 * `for await` over a `ReadableStream`, which pdf.js uses to read a page's text (search in the
 * PDF) and which WebKit lacks before Safari 26 (macOS 15's WKWebView): not even pdf.js's legacy
 * build fills it in. Installed only where missing.
 */
export function installStreamIterator(
  proto: object | undefined = globalThis.ReadableStream?.prototype,
) {
  if (!proto || Symbol.asyncIterator in proto) return;
  Object.defineProperty(proto, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* (this: ReadableStream) {
      const reader = this.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}
