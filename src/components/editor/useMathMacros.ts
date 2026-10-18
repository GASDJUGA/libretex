import { useCallback, useEffect, useMemo, useRef } from "react";
import { collectMacros, collectPackages, type MathJaxMacros } from "../../lib/macros/extract";
import { useBuffers } from "../../store/buffers";
import { useProjects } from "../../store/projects";

/** Getters for what the editor needs from the preamble. */
export type Preamble = { macros: () => MathJaxMacros; packages: () => Set<string> };

/**
 * The user's macros (math preview, completion) and the packages loaded (their commands are
 * completed), from the preamble of the main file and the files it includes there. They
 * follow every edit of those buffers; files not loaded yet are loaded in the background (as
 * buffers, without tabs). Returns getters for the editor.
 */
export function usePreamble(): Preamble {
  const mainFile = useProjects((s) => s.current?.mainFile ?? null);
  const buffers = useBuffers((s) => s.buffers);
  const errors = useBuffers((s) => s.errors);
  const load = useBuffers((s) => s.load);

  const { macros, packages, missing } = useMemo(() => {
    const missing: string[] = [];
    if (!mainFile) return { macros: {}, packages: new Set<string>(), missing };
    const read = (path: string) => {
      const buffer = buffers[path];
      if (buffer) return buffer.content;
      if (!(path in errors) && !missing.includes(path)) missing.push(path);
      return null;
    };
    return {
      macros: collectMacros(mainFile, read),
      packages: collectPackages(mainFile, read),
      missing,
    };
  }, [mainFile, buffers, errors]);

  const missingKey = missing.join("\n");
  useEffect(() => {
    for (const path of missingKey.split("\n")) if (path) load(path).catch(() => {});
  }, [missingKey, load]);

  const ref = useRef({ macros, packages });
  useEffect(() => {
    ref.current = { macros, packages };
  }, [macros, packages]);
  const getMacros = useCallback(() => ref.current.macros, []);
  const getPackages = useCallback(() => ref.current.packages, []);
  return useMemo(() => ({ macros: getMacros, packages: getPackages }), [getMacros, getPackages]);
}
