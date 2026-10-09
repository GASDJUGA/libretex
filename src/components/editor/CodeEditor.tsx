import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { notifyError } from "../../lib/errors";
import { editorPhrases } from "../../editor/phrases";
import { editorExtensions } from "../../editor/setup";
import { useI18n } from "../../i18n";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";

/** Idle time after the last edit before saving automatically. */
export const AUTOSAVE_MS = 1000;

type CodeEditorProps = {
  path: string;
  /** Initial text (the buffer content when the file is first shown). */
  content: string;
};

/**
 * One CodeMirror view shared by every tab: each file keeps its own EditorState (undo
 * history, selection, folds), swapped in when its tab becomes active. Edits update the
 * buffers store and are saved automatically.
 */
export function CodeEditor({ path, content }: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const pathRef = useRef(path);
  /** Text last pushed to the store by this editor, to tell our edits from external ones. */
  const synced = useRef(new Map<string, string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const phrases = useRef(new Compartment());
  const locale = useI18n((s) => s.locale);

  const saveNow = (file: string) => {
    clearTimeout(saveTimer.current);
    const buffer = useBuffers.getState().buffers[file];
    if (buffer && buffer.content !== buffer.saved) {
      useBuffers.getState().save(file).catch(notifyError);
    }
  };

  const createState = (doc: string) =>
    EditorState.create({
      doc,
      extensions: [
        editorExtensions({
          onChange: (text) => {
            const current = pathRef.current;
            synced.current.set(current, text);
            useBuffers.getState().setContent(current, text);
            clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => saveNow(current), AUTOSAVE_MS);
          },
          onCursorLine: (line) => useProjectView.getState().setCursorLine(line),
          onSave: () => saveNow(pathRef.current),
        }),
        phrases.current.of(editorPhrases(useI18n.getState().locale)),
      ],
    });

  // Create the view once.
  useEffect(() => {
    const view = new EditorView({
      state: createState(content),
      parent: hostRef.current!,
    });
    viewRef.current = view;
    synced.current.set(path, content);
    const statesMap = states.current;
    return () => {
      // Leaving the project view: save pending edits.
      saveNow(pathRef.current);
      view.destroy();
      viewRef.current = null;
      statesMap.clear();
    };
    // The view is created once; tab switches are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch tabs: keep the previous file's state, restore (or create) the new one.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || pathRef.current === path) return;
    saveNow(pathRef.current);
    states.current.set(pathRef.current, view.state);
    pathRef.current = path;
    const saved = states.current.get(path);
    const buffer = useBuffers.getState().buffers[path];
    const text = buffer?.content ?? content;
    view.setState(saved && saved.doc.toString() === text ? saved : createState(text));
    synced.current.set(path, text);
    useProjectView
      .getState()
      .setCursorLine(view.state.doc.lineAt(view.state.selection.main.head).number);
    view.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // External changes to the buffer (reload from disk, conflict resolution): replace the text.
  const bufferContent = useBuffers((s) => s.buffers[path]?.content);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || bufferContent === undefined || pathRef.current !== path) return;
    if (bufferContent === synced.current.get(path)) return;
    synced.current.set(path, bufferContent);
    if (view.state.doc.toString() === bufferContent) return;
    const head = Math.min(view.state.selection.main.head, bufferContent.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: bufferContent },
      selection: { anchor: head },
    });
  }, [bufferContent, path]);

  // UI language for the search panel and folding labels.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: phrases.current.reconfigure(editorPhrases(locale)) });
  }, [locale]);

  // Forget the state of closed tabs.
  const openFiles = useProjectView((s) => s.openFiles);
  useEffect(() => {
    for (const file of states.current.keys()) {
      if (!openFiles.includes(file)) states.current.delete(file);
    }
  }, [openFiles]);

  return <div ref={hostRef} className="h-full" data-testid="code-editor" />;
}
