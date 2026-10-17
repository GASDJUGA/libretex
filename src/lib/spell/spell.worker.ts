/**
 * Web worker that holds a Hunspell dictionary (loading the Spanish one takes about half a
 * second and ~80 MB): the editor never waits for it.
 */
import { createSpeller, type Speller } from "./speller";

export type WorkerRequest =
  | { id: number; type: "init"; aff: string; dic: string }
  | { id: number; type: "wrong"; words: string[] }
  | { id: number; type: "suggest"; word: string }
  | { id: number; type: "add" | "remove"; words: string[] };

export type WorkerResponse =
  { id: number; ok: true; result: string[] } | { id: number; ok: false; error: string };

let speller: Promise<Speller> | null = null;

async function load(affUrl: string, dicUrl: string) {
  const [aff, dic] = await Promise.all(
    [affUrl, dicUrl].map((url) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.text();
      }),
    ),
  );
  return createSpeller(aff, dic);
}

async function handle(request: WorkerRequest): Promise<string[]> {
  if (request.type === "init") {
    speller = load(request.aff, request.dic);
    await speller;
    return [];
  }
  if (!speller) throw new Error("diccionario no cargado");
  const s = await speller;
  switch (request.type) {
    case "wrong":
      return s.wrong(request.words);
    case "suggest":
      return s.suggest(request.word);
    case "add":
      s.add(request.words);
      return [];
    case "remove":
      s.remove(request.words);
      return [];
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  handle(request).then(
    (result) => self.postMessage({ id: request.id, ok: true, result } satisfies WorkerResponse),
    (error: unknown) =>
      self.postMessage({
        id: request.id,
        ok: false,
        error: String(error),
      } satisfies WorkerResponse),
  );
};
