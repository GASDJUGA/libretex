import { create } from "zustand";
import { parseLatexLog, type ParsedLog } from "../lib/latexLog/parse";
import { getBackend } from "../lib/tauri";
import { isDirty, useBuffers } from "./buffers";
import type { CompileEvent, CompileRequest, CompileStatus } from "./types";

export type CompileResult = {
  runId: number;
  status: CompileStatus;
  durationMs: number;
  log: string;
  pdf: string | null;
  mainFile: string;
  error: string | null;
  /** When it finished (ms since epoch). */
  at: number;
  /** Problems found in the log. */
  parsed: ParsedLog;
};

type CompileState = {
  projectId: string | null;
  /** A compilation is running (`queued`: another request waits behind it). */
  running: boolean;
  queued: boolean;
  runId: number | null;
  /** latexmk output of the current/last run. */
  output: string[];
  last: CompileResult | null;

  reset: (projectId: string) => void;
  /** Saves pending edits, then compiles (or queues). */
  compile: (request: CompileRequest) => Promise<void>;
  cancel: () => Promise<void>;
  cleanBuild: () => Promise<number>;
  /** Applies an event from the backend. */
  handleEvent: (event: CompileEvent) => void;
};

/** Output lines kept in memory (latexmk can be chatty). */
const MAX_OUTPUT_LINES = 5000;

export const useCompile = create<CompileState>()((set, get) => ({
  projectId: null,
  running: false,
  queued: false,
  runId: null,
  output: [],
  last: null,

  reset: (projectId) =>
    set({ projectId, running: false, queued: false, runId: null, output: [], last: null }),

  compile: async (request) => {
    const { projectId } = get();
    if (!projectId) return;
    // Compile what the user sees: save every open buffer with unsaved edits first.
    const buffers = useBuffers.getState();
    await Promise.all(
      Object.entries(buffers.buffers)
        .filter(([, buffer]) => isDirty(buffer))
        .map(([path]) => buffers.save(path)),
    );
    const { runId } = await getBackend().compileProject(projectId, request);
    if (runId === null) set({ queued: true });
    else set({ running: true, runId, output: [] });
  },

  cancel: async () => {
    const { projectId } = get();
    if (projectId) await getBackend().cancelCompile(projectId);
  },

  cleanBuild: async () => {
    const { projectId } = get();
    return projectId ? getBackend().cleanBuild(projectId) : 0;
  },

  handleEvent: (event) => {
    if (event.projectId !== get().projectId) return;
    switch (event.type) {
      case "started":
        set({ running: true, queued: false, runId: event.runId, output: [] });
        break;
      case "output":
        set((s) => ({ output: [...s.output, ...event.lines].slice(-MAX_OUTPUT_LINES) }));
        break;
      case "finished":
        set((s) => ({
          // A queued request starts right away (its own `started` event follows).
          running: false,
          runId: s.runId,
          last: {
            runId: event.runId,
            status: event.status,
            durationMs: event.durationMs,
            log: event.log,
            pdf: event.pdf,
            mainFile: event.mainFile,
            error: event.error,
            at: Date.now(),
            parsed: parseLatexLog(event.log),
          },
        }));
        break;
    }
  },
}));

export const initialCompileState = {
  projectId: null,
  running: false,
  queued: false,
  runId: null,
  output: [],
  last: null,
};
