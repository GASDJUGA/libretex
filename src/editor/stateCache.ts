/**
 * The editor state of each file of the project tabs that are not on screen (see
 * store/workspaces.ts): text, selection and undo history, so going back to a tab keeps
 * Ctrl+Z working. Kept as JSON: the extensions are rebuilt by the editor that takes it.
 */
import { historyField } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";

const FIELDS = { history: historyField };

const cache = new Map<string, Map<string, unknown>>();

/** Keeps the states of a project's files when its editor goes away. */
export function stashEditorStates(projectId: string, states: Map<string, EditorState>) {
  const files = new Map<string, unknown>();
  for (const [path, state] of states) files.set(path, state.toJSON(FIELDS));
  cache.set(projectId, files);
}

/**
 * The stashed state of `path` with new `extensions`, if there is one for exactly `doc`
 * (the text may have changed on disk meanwhile). Taken once.
 */
export function takeEditorState(
  projectId: string,
  path: string,
  doc: string,
  extensions: Extension,
): EditorState | null {
  const files = cache.get(projectId);
  const json = files?.get(path);
  if (!files || json === undefined) return null;
  files.delete(path);
  try {
    const state = EditorState.fromJSON(json, { extensions }, FIELDS);
    return state.doc.toString() === doc.replace(/\r\n?/g, "\n") ? state : null;
  } catch {
    return null;
  }
}

/** The tab was closed: nothing to come back to. */
export function dropEditorStates(projectId: string) {
  cache.delete(projectId);
}
