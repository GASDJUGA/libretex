import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectMacros, collectPackages, type MathJaxMacros } from "../../lib/macros/extract";
import { collectEnvironments, type UserEnvironment } from "../../lib/macros/environments";
import { getBackend } from "../../lib/tauri";
import { useBuffers } from "../../store/buffers";
import { useProjects } from "../../store/projects";
import type { PackageDefinition } from "../../store/types";

/** Getters for what the editor needs from the preamble. */
export type Preamble = {
  macros: () => MathJaxMacros;
  packages: () => Set<string>;
  environments: () => UserEnvironment[];
  /** What the loaded packages define (read from their style files by the backend). */
  definitions: () => PackageDefinition[];
};

const NO_DEFINITIONS: PackageDefinition[] = [];

/** Definitions by project and set of packages: asked once per change of the preamble. */
const definitionsCache = new Map<string, Promise<PackageDefinition[]>>();

function packageDefinitions(projectId: string, packages: string[]): Promise<PackageDefinition[]> {
  const key = `${projectId}\n${packages.join(",")}`;
  let pending = definitionsCache.get(key);
  if (!pending) {
    pending = getBackend()
      .packageDefinitions(projectId, packages)
      .catch(() => {
        definitionsCache.delete(key);
        return [];
      });
    definitionsCache.set(key, pending);
  }
  return pending;
}

/** For tests. */
export function resetPackageDefinitions() {
  definitionsCache.clear();
}

/**
 * The user's macros (math preview, completion) and the packages loaded (their commands are
 * completed), from the preamble of the main file and the files it includes there. They
 * follow every edit of those buffers; files not loaded yet are loaded in the background (as
 * buffers, without tabs). Returns getters for the editor.
 */
export function usePreamble(): Preamble {
  const mainFile = useProjects((s) => s.current?.mainFile ?? null);
  const projectId = useProjects((s) => s.current?.id ?? null);
  const buffers = useBuffers((s) => s.buffers);
  const errors = useBuffers((s) => s.errors);
  const load = useBuffers((s) => s.load);

  const { macros, packages, environments, missing } = useMemo(() => {
    const missing: string[] = [];
    if (!mainFile) {
      return { macros: {}, packages: new Set<string>(), environments: [], missing };
    }
    const read = (path: string) => {
      const buffer = buffers[path];
      if (buffer) return buffer.content;
      if (!(path in errors) && !missing.includes(path)) missing.push(path);
      return null;
    };
    return {
      macros: collectMacros(mainFile, read),
      packages: collectPackages(mainFile, read),
      environments: collectEnvironments(mainFile, read),
      missing,
    };
  }, [mainFile, buffers, errors]);

  const missingKey = missing.join("\n");
  useEffect(() => {
    for (const path of missingKey.split("\n")) if (path) load(path).catch(() => {});
  }, [missingKey, load]);

  // The packages' own commands and environments, asked again when the list changes.
  const packagesKey = [...packages].sort().join(",");
  const definitionsKey = projectId && packagesKey ? `${projectId}\n${packagesKey}` : "";
  const [loaded, setLoaded] = useState<{ key: string; found: PackageDefinition[] }>({
    key: "",
    found: [],
  });
  useEffect(() => {
    if (!projectId || !packagesKey) return;
    let current = true;
    void packageDefinitions(projectId, packagesKey.split(",")).then((found) => {
      if (current) setLoaded({ key: `${projectId}\n${packagesKey}`, found });
    });
    return () => {
      current = false;
    };
  }, [projectId, packagesKey]);
  // Until the new list arrives, the previous one (most packages stay the same).
  const definitions = definitionsKey ? loaded.found : NO_DEFINITIONS;

  const ref = useRef({ macros, packages, environments, definitions });
  useEffect(() => {
    ref.current = { macros, packages, environments, definitions };
  }, [macros, packages, environments, definitions]);
  const getMacros = useCallback(() => ref.current.macros, []);
  const getPackages = useCallback(() => ref.current.packages, []);
  const getEnvironments = useCallback(() => ref.current.environments, []);
  const getDefinitions = useCallback(() => ref.current.definitions, []);
  return useMemo(
    () => ({
      macros: getMacros,
      packages: getPackages,
      environments: getEnvironments,
      definitions: getDefinitions,
    }),
    [getMacros, getPackages, getEnvironments, getDefinitions],
  );
}
