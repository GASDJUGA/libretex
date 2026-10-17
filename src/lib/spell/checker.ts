/**
 * Spell checkers by language, each in its own web worker with the bundled Hunspell
 * dictionary (never downloaded: «local primero»). Answers are cached per word.
 */
import esAff from "@dictionaries/es.aff?url";
import esDic from "@dictionaries/es.dic?url";
import enAff from "@dictionaries/en.aff?url";
import enDic from "@dictionaries/en.dic?url";
import type { Speller } from "./speller";
import type { WorkerRequest, WorkerResponse } from "./spell.worker";

export type SpellLang = "es" | "en";

/** What the editor needs: asynchronous, so the dictionary can live in a worker. */
export type SpellChecker = {
  /** The words of `words` that are not correct. */
  wrong(words: string[]): Promise<string[]>;
  suggest(word: string): Promise<string[]>;
  /** Words of the personal dictionary (also when it changes). */
  setPersonal(words: string[]): void;
  /** Known answer for `word`, if it was already checked (`true` = correct). */
  known(word: string): boolean | undefined;
  dispose(): void;
};

const DICTIONARIES: Record<SpellLang, { aff: string; dic: string }> = {
  es: { aff: esAff, dic: esDic },
  en: { aff: enAff, dic: enDic },
};

type Backend = {
  request(
    type: "wrong" | "suggest" | "add" | "remove",
    payload: string[] | string,
  ): Promise<string[]>;
  dispose(): void;
};

/** Checker on top of a backend (a worker, or nspell directly in the tests). */
export function makeChecker(backend: Backend): SpellChecker {
  const answers = new Map<string, boolean>();
  let personal = new Set<string>();
  return {
    async wrong(words) {
      const unknown = [...new Set(words.filter((w) => !answers.has(w)))];
      if (unknown.length > 0) {
        const wrong = new Set(await backend.request("wrong", unknown));
        for (const w of unknown) answers.set(w, !wrong.has(w));
      }
      return words.filter((w) => answers.get(w) === false);
    },
    suggest: (word) => backend.request("suggest", word),
    setPersonal(words) {
      const next = new Set(words);
      const added = [...next].filter((w) => !personal.has(w));
      const removed = [...personal].filter((w) => !next.has(w));
      personal = next;
      if (added.length > 0) void backend.request("add", added);
      if (removed.length > 0) void backend.request("remove", removed);
      // Answers may change for these words and their forms (capitalized…).
      if (added.length > 0 || removed.length > 0) answers.clear();
    },
    known: (word) => answers.get(word),
    dispose: () => backend.dispose(),
  };
}

/** A checker for `lang` in a new web worker. */
export function workerChecker(lang: SpellLang): SpellChecker {
  const worker = new Worker(new URL("./spell.worker.ts", import.meta.url), { type: "module" });
  let next = 0;
  const pending = new Map<number, { resolve: (r: string[]) => void; reject: (e: Error) => void }>();
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const waiting = pending.get(response.id);
    if (!waiting) return;
    pending.delete(response.id);
    if (response.ok) waiting.resolve(response.result);
    else waiting.reject(new Error(response.error));
  };
  const send = (request: WorkerRequest) =>
    new Promise<string[]>((resolve, reject) => {
      pending.set(request.id, { resolve, reject });
      worker.postMessage(request);
    });
  const absolute = (url: string) => new URL(url, document.baseURI).href;
  const { aff, dic } = DICTIONARIES[lang];
  const ready = send({ id: next++, type: "init", aff: absolute(aff), dic: absolute(dic) });
  return makeChecker({
    async request(type, payload) {
      await ready;
      const id = next++;
      return type === "suggest"
        ? send({ id, type, word: payload as string })
        : send({ id, type, words: payload as string[] });
    },
    dispose: () => {
      worker.terminate();
      for (const { reject } of pending.values()) reject(new Error("cancelado"));
      pending.clear();
    },
  });
}

/** A checker running nspell in this thread (tests). */
export function directChecker(speller: Speller): SpellChecker {
  return makeChecker({
    async request(type, payload) {
      switch (type) {
        case "wrong":
          return speller.wrong(payload as string[]);
        case "suggest":
          return speller.suggest(payload as string);
        case "add":
          speller.add(payload as string[]);
          return [];
        case "remove":
          speller.remove(payload as string[]);
          return [];
      }
    },
    dispose: () => {},
  });
}
