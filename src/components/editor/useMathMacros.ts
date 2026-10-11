import { useCallback, useEffect, useMemo, useRef } from "react";
import { collectMacros, type MathJaxMacros } from "../../lib/macros/extract";
import { useBuffers } from "../../store/buffers";
import { useProjects } from "../../store/projects";

/**
 * The user's macros for the math preview, from the preamble of the main file and the files
 * it includes there. They follow every edit of those buffers; files not loaded yet are
 * loaded in the background (as buffers, without tabs). Returns a getter for the editor.
 */
export function useMathMacros(): () => MathJaxMacros {
  const mainFile = useProjects((s) => s.current?.mainFile ?? null);
  const buffers = useBuffers((s) => s.buffers);
  const errors = useBuffers((s) => s.errors);
  const load = useBuffers((s) => s.load);

  const { macros, missing } = useMemo(() => {
    const missing: string[] = [];
    if (!mainFile) return { macros: {}, missing };
    const macros = collectMacros(mainFile, (path) => {
      const buffer = buffers[path];
      if (buffer) return buffer.content;
      if (!(path in errors)) missing.push(path);
      return null;
    });
    return { macros, missing };
  }, [mainFile, buffers, errors]);

  const missingKey = missing.join("\n");
  useEffect(() => {
    for (const path of missingKey.split("\n")) if (path) load(path).catch(() => {});
  }, [missingKey, load]);

  const ref = useRef(macros);
  useEffect(() => {
    ref.current = macros;
  }, [macros]);
  return useCallback(() => ref.current, []);
}
