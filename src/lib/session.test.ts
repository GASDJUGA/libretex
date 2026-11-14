import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filePosition,
  flushSessions,
  loadSession,
  MAX_FILES,
  outlineCollapsed,
  parseSession,
  rememberFile,
  rememberOutline,
  rememberPdf,
  rememberView,
  renameInSession,
  resetSessions,
  restoredTabs,
  SAVE_DELAY_MS,
} from "./session";

/** In-memory storage that counts writes. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    writes: 0,
    getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) {
      this.writes++;
      data.set(key, value);
    },
    removeItem: (key: string) => void data.delete(key),
  };
}

let storage: ReturnType<typeof memoryStorage>;

beforeEach(() => {
  vi.useFakeTimers();
  storage = memoryStorage();
  resetSessions(storage);
});
afterEach(() => {
  vi.useRealTimers();
  resetSessions(typeof window === "undefined" ? null : window.localStorage);
});

describe("memoria de la sesión", () => {
  it("sin nada guardado no hay sesión", () => {
    expect(loadSession("p")).toBeNull();
  });

  it("guarda poco después del último cambio, una sola escritura", () => {
    rememberView("p", { openFiles: ["main.tex", "cap.tex"], activeFile: "cap.tex" });
    rememberFile("p", "cap.tex", { line: 40, column: 3, topLine: 25 });
    rememberPdf("p", { location: { pageNumber: 4, left: 0, top: 500 }, zoom: 1.25 });
    expect(storage.writes).toBe(0);
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    expect(storage.writes).toBe(1);

    // Another run of the app reads it back.
    resetSessions(storage);
    expect(loadSession("p")).toMatchObject({
      openFiles: ["main.tex", "cap.tex"],
      activeFile: "cap.tex",
      files: { "cap.tex": { line: 40, column: 3, topLine: 25 } },
      pdf: { location: { pageNumber: 4, left: 0, top: 500 }, zoom: 1.25 },
    });
    expect(filePosition("p", "cap.tex")).toEqual({ line: 40, column: 3, topLine: 25 });
    expect(filePosition("p", "otro.tex")).toBeNull();
  });

  it("cada proyecto tiene la suya", () => {
    rememberFile("a", "main.tex", { line: 2, column: 0, topLine: 1 });
    flushSessions();
    expect(loadSession("b")).toBeNull();
    expect(loadSession("a")).not.toBeNull();
  });

  it("lo que devuelve es una copia: cambios posteriores no la alteran", () => {
    rememberView("p", { openFiles: ["a.tex"], activeFile: "a.tex" });
    const saved = loadSession("p")!;
    rememberView("p", { openFiles: [], activeFile: null });
    expect(saved.openFiles).toEqual(["a.tex"]);
  });

  it("recuerda solo los archivos usados más recientemente", () => {
    for (let i = 0; i <= MAX_FILES; i++) {
      rememberFile("p", `f${i}.tex`, { line: 1, column: 0, topLine: 1 });
    }
    // Using an old one again keeps it.
    rememberFile("p", "f1.tex", { line: 9, column: 0, topLine: 1 });
    rememberFile("p", "nuevo.tex", { line: 1, column: 0, topLine: 1 });
    expect(filePosition("p", "f0.tex")).toBeNull();
    expect(filePosition("p", "f2.tex")).toBeNull();
    expect(filePosition("p", "f1.tex")?.line).toBe(9);
    expect(Object.keys(loadSession("p")!.files)).toHaveLength(MAX_FILES);
  });

  it("al renombrar o mover, las posiciones siguen a los archivos", () => {
    rememberFile("p", "capitulos/a.tex", { line: 5, column: 0, topLine: 1 });
    rememberFile("p", "main.tex", { line: 7, column: 0, topLine: 1 });
    renameInSession("p", "capitulos", "partes");
    expect(filePosition("p", "partes/a.tex")?.line).toBe(5);
    expect(filePosition("p", "capitulos/a.tex")).toBeNull();
    expect(filePosition("p", "main.tex")?.line).toBe(7);
  });

  it("descarta lo mal formado (de otra versión o editado a mano)", () => {
    expect(parseSession("no es json")).toBeNull();
    expect(parseSession("[1, 2]")).toBeNull();
    const session = parseSession(
      JSON.stringify({
        openFiles: ["a.tex", 3, "a.tex", "b.tex"],
        activeFile: "zzz.tex",
        layoutMode: "gigante",
        sidePanel: "logs",
        files: {
          "a.tex": { line: 3, column: 1, topLine: 1 },
          "b.tex": { line: 0, column: 1, topLine: 1 },
          "c.tex": "x",
        },
        pdf: { location: { pageNumber: 2, left: 0, top: "x" }, zoom: 1 },
      }),
    )!;
    expect(session.openFiles).toEqual(["a.tex", "b.tex"]);
    expect(session.activeFile).toBe("a.tex");
    expect(session.layoutMode).toBeUndefined();
    expect(session.sidePanel).toBe("logs");
    expect(Object.keys(session.files)).toEqual(["a.tex"]);
    expect(session.pdf).toBeUndefined();
  });

  it("recuerda las secciones colapsadas del esquema", () => {
    expect(outlineCollapsed("p")).toEqual([]);
    rememberOutline("p", ["main.tex\n1\nUno\n0"]);
    vi.advanceTimersByTime(SAVE_DELAY_MS);
    resetSessions(storage);
    expect(outlineCollapsed("p")).toEqual(["main.tex\n1\nUno\n0"]);
    expect(
      parseSession(JSON.stringify({ outlineCollapsed: ["a", 2, "b"] }))!.outlineCollapsed,
    ).toEqual(["a", "b"]);
  });

  it("otra ventana usó el proyecto: se lee su posición, no una copia vieja", () => {
    rememberFile("p", "main.tex", { line: 5, column: 0, topLine: 1 });
    flushSessions();
    // Another window (same storage) moves on in the same file.
    const other = parseSession(storage.data.get("jutex:p:session")!)!;
    other.files["main.tex"] = { line: 400, column: 2, topLine: 380, topOffset: 120 };
    storage.setItem("jutex:p:session", JSON.stringify(other));
    expect(filePosition("p", "main.tex")).toEqual({
      line: 400,
      column: 2,
      topLine: 380,
      topOffset: 120,
    });
    // And a change here keeps what the other window wrote.
    rememberFile("p", "otro.tex", { line: 1, column: 0, topLine: 1 });
    flushSessions();
    expect(parseSession(storage.data.get("jutex:p:session")!)!.files["main.tex"].line).toBe(400);
  });

  it("guarda cuánto se bajó dentro de la primera línea (párrafos largos)", () => {
    rememberFile("p", "a.tex", { line: 3, column: 0, topLine: 2, topOffset: 85 });
    flushSessions();
    resetSessions(storage);
    expect(filePosition("p", "a.tex")).toEqual({ line: 3, column: 0, topLine: 2, topOffset: 85 });
    expect(
      parseSession(
        JSON.stringify({ files: { "b.tex": { line: 1, column: 0, topLine: 1, topOffset: -3 } } }),
      )!.files["b.tex"],
    ).toEqual({ line: 1, column: 0, topLine: 1 });
  });

  it("almacenamiento que falla: la sesión dura lo que dura la ejecución", () => {
    resetSessions({
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("lleno");
      },
      removeItem: () => {},
    });
    rememberFile("p", "a.tex", { line: 2, column: 0, topLine: 1 });
    expect(() => flushSessions()).not.toThrow();
    expect(filePosition("p", "a.tex")?.line).toBe(2);
  });

  it("pestañas a reabrir: las que siguen existiendo, o el archivo principal", () => {
    const session = parseSession(
      JSON.stringify({ openFiles: ["a.tex", "borrado.tex", "b.tex"], activeFile: "borrado.tex" }),
    );
    const exists = (p: string) => p !== "borrado.tex";
    expect(restoredTabs(session, exists, "main.tex")).toEqual({
      openFiles: ["a.tex", "b.tex"],
      activeFile: "a.tex",
    });
    expect(restoredTabs(session, () => false, "main.tex")).toEqual({
      openFiles: ["main.tex"],
      activeFile: "main.tex",
    });
    expect(restoredTabs(null, exists, "main.tex").activeFile).toBe("main.tex");
  });
});
