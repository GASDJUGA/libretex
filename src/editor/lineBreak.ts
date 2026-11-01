/**
 * `\\` is a line break, not the start of a command: no completion list after it (pedido del
 * usuario), nor for letters typed right after it (`\\al` is a line break and «al»). A third
 * backslash does start a command again (`\\\alpha`).
 */
import type { CompletionContext, CompletionSource } from "@codemirror/autocomplete";

/** The backslashes before the cursor (and the letters after them) pair up into line breaks. */
export function afterLineBreak(context: CompletionContext): boolean {
  const run = context.matchBefore(/\\+[A-Za-z@]*$/);
  if (!run) return false;
  const slashes = /^\\+/.exec(run.text)![0].length;
  return slashes % 2 === 0;
}

export function notAfterLineBreak(source: CompletionSource): CompletionSource {
  return (context) => (afterLineBreak(context) ? null : source(context));
}
