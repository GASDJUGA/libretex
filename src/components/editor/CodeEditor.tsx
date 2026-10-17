import { Compartment, EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceLinting } from "@codemirror/lint";
import { diff } from "@codemirror/merge";
import { useEffect, useRef } from "react";
import { notifyError } from "../../lib/errors";
import { setActiveView } from "../../editor/activeView";
import { projectCompletionSource } from "../../editor/completion";
import { diagnosticsFor } from "../../editor/diagnostics";
import { useCompile } from "../../store/compile";
import { indentation } from "../../editor/indent";
import { liveCheck, showCompileDiagnostics } from "../../editor/liveCheck";
import { mathPreview, refreshMathPreview } from "../../editor/mathPreview";
import { locateWord } from "../../lib/pdf/sourceWord";
import { editorPhrases } from "../../editor/phrases";
import { editorExtensions } from "../../editor/setup";
import { translate, useI18n } from "../../i18n";
import { useProjectFiles } from "../../store/files";
import { useProjectIndex } from "../../store/projectIndex";
import type { FileNode } from "../../store/types";
import { useBuffers } from "../../store/buffers";
import { useProjectView } from "../../store/project";
import { useSettings } from "../../store/settings";
import { useMathMacros } from "./useMathMacros";
import { userCommandSource } from "../../editor/latexCompletion";
import { filePosition, rememberFile } from "../../lib/session";
import { useProjects } from "../../store/projects";

const filePaths = (nodes: FileNode[]): string[] =>
  nodes.flatMap((n) => (n.kind === "file" ? [n.path] : filePaths(n.children)));

/** References, citations and paths of the open project, read when completing. */
const completionSource = projectCompletionSource({
  labels: () => useProjectIndex.getState().labels,
  citations: () => useProjectIndex.getState().citations,
  files: () => filePaths(useProjectFiles.getState().tree),
  describe: {
    label: (file, line) => translate(useI18n.getState().locale, "editor.labelAt", { file, line }),
  },
});

/** Files checked while typing (others, like .sty or .bib, are full of special syntax). */
const CHECKED_FILE = /\.(tex|ltx)$/i;

const currentProject = () => useProjects.getState().current?.id ?? null;

/** The cursor where `path` was left (in this or an earlier session), or the start. */
function savedSelection(path: string, doc: EditorState["doc"]) {
  const projectId = currentProject();
  const at = projectId ? filePosition(projectId, path) : null;
  if (!at) return undefined;
  const line = doc.line(Math.min(at.line, doc.lines));
  return { anchor: line.from + Math.min(at.column, line.length) };
}

/** Scrolls back to the first visible line where `path` was left. */
function restoreScroll(view: EditorView, path: string) {
  const projectId = currentProject();
  const at = projectId ? filePosition(projectId, path) : null;
  if (!at) return;
  const line = view.state.doc.line(Math.min(at.topLine, view.state.doc.lines));
  view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 0 }) });
}

/** Records the cursor and the first visible line of `path`, for the next session. */
function rememberPlace(view: EditorView, path: string) {
  const projectId = currentProject();
  if (!projectId) return;
  const { doc } = view.state;
  const line = doc.lineAt(view.state.selection.main.head);
  const top = view.lineBlockAtHeight(
    Math.max(0, view.scrollDOM.scrollTop - view.documentPadding.top),
  );
  rememberFile(projectId, path, {
    line: line.number,
    column: view.state.selection.main.head - line.from,
    topLine: doc.lineAt(Math.min(top.from, doc.length)).number,
  });
}

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
  const indent = useRef(new Compartment());
  const indentMode = useSettings((s) => s.indentMode);
  const locale = useI18n((s) => s.locale);

  const saveNow = (file: string) => {
    clearTimeout(saveTimer.current);
    const buffer = useBuffers.getState().buffers[file];
    if (buffer && buffer.content !== buffer.saved) {
      useBuffers.getState().save(file).catch(notifyError);
    }
  };

  const mathMacros = useMathMacros();

  const createState = (doc: string) => {
    const checked = CHECKED_FILE.test(pathRef.current);
    const file = pathRef.current;
    const text = Text.of(doc.split(/\r\n?|\n/));
    return EditorState.create({
      doc: text,
      selection: savedSelection(file, text),
      extensions: [
        // Where the file was left, for the next time it is opened.
        EditorView.updateListener.of((update) => {
          if (update.selectionSet && pathRef.current === file) rememberPlace(update.view, file);
        }),
        EditorView.domEventObservers({
          scroll: (_event, view) => {
            if (pathRef.current === file) rememberPlace(view, file);
          },
        }),
        editorExtensions(
          {
            onChange: (text) => {
              const current = pathRef.current;
              synced.current.set(current, text);
              useBuffers.getState().setContent(current, text);
              clearTimeout(saveTimer.current);
              saveTimer.current = setTimeout(() => saveNow(current), AUTOSAVE_MS);
            },
            onCursorLine: (line) => useProjectView.getState().setCursorLine(line),
            onSave: () => saveNow(pathRef.current),
            onCompile: () => useCompile.getState().compileNow().catch(notifyError),
            onSyncToPdf: () => useProjectView.getState().syncToPdf(),
          },
          [
            phrases.current.of(editorPhrases(useI18n.getState().locale)),
            indent.current.of(indentation(useSettings.getState().indentMode)),
            liveCheck({
              message: (problem) =>
                translate(useI18n.getState().locale, `check.${problem.code}`, { ...problem }),
              source: translate(useI18n.getState().locale, "check.source"),
              enabled: () => checked && useSettings.getState().liveCheck,
            }),
            mathPreview({
              enabled: () => checked && useSettings.getState().mathPreview,
              hover: () =>
                checked &&
                useSettings.getState().mathPreview &&
                useSettings.getState().mathPreviewHover,
              macros: mathMacros,
              errorLabel: () => translate(useI18n.getState().locale, "mathPreview.error"),
            }),
          ],
          [
            completionSource,
            userCommandSource(mathMacros, () =>
              translate(useI18n.getState().locale, "editor.userCommand"),
            ),
          ],
        ),
      ],
    });
  };

  // Create the view once.
  useEffect(() => {
    const view = new EditorView({
      state: createState(content),
      parent: hostRef.current!,
    });
    viewRef.current = view;
    setActiveView(view);
    restoreScroll(view, path);
    synced.current.set(path, content);
    const statesMap = states.current;
    return () => {
      // Leaving the project view: save pending edits.
      saveNow(pathRef.current);
      view.destroy();
      viewRef.current = null;
      setActiveView(null);
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
    restoreScroll(view, path);
    // A restored state may carry an older language or indentation setting.
    view.dispatch({
      effects: [
        phrases.current.reconfigure(editorPhrases(useI18n.getState().locale)),
        indent.current.reconfigure(indentation(useSettings.getState().indentMode)),
      ],
    });
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
    const current = view.state.doc.toString();
    const next = bufferContent.replace(/\r\n?/g, "\n");
    if (current === next) return;
    // Only what differs (a project-wide replacement, a change made outside): the cursor,
    // the scroll and the rest of the undo history stay where they were.
    view.dispatch({
      changes: diff(current, next, { timeout: 200 }).map((c) => ({
        from: c.fromA,
        to: c.toA,
        insert: next.slice(c.fromB, c.toB),
      })),
    });
  }, [bufferContent, path]);

  // Compilation problems of this file, as underlines and gutter markers. They are applied
  // after each compilation and when the tab changes; CodeMirror then maps them through edits.
  const parsed = useCompile((s) => s.last?.parsed ?? null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || pathRef.current !== path) return;
    showCompileDiagnostics(view, diagnosticsFor(parsed, path, view.state.doc));
  }, [parsed, path]);

  // Turning the math preview on or off applies at once too.
  const mathPreviewOn = useSettings((s) => s.mathPreview);
  useEffect(() => {
    if (viewRef.current) refreshMathPreview(viewRef.current);
  }, [mathPreviewOn]);

  // Turning the live check on or off (Settings / «Ver» menu) applies at once.
  const liveCheckOn = useSettings((s) => s.liveCheck);
  useEffect(() => {
    if (viewRef.current) forceLinting(viewRef.current);
  }, [liveCheckOn]);

  // Jumps requested by the outline (and later the logs and SyncTeX).
  const goto = useProjectView((s) => s.goto);
  const handledGoto = useRef<number | null>(null);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !goto || goto.path !== path || handledGoto.current === goto.nonce) return;
    handledGoto.current = goto.nonce;
    const doc = view.state.doc;
    const line = doc.line(Math.min(Math.max(goto.line, 1), doc.lines));
    // From the PDF (SyncTeX gives only the line): select the clicked word if it is there.
    const word = goto.word && locateWord(doc.toJSON(), goto.line, goto.word);
    const at = (lineNumber: number, column: number) => {
      const target = doc.line(Math.min(Math.max(lineNumber, 1), doc.lines));
      return target.from + Math.min(Math.max(column, 0), target.length);
    };
    const selection = goto.range
      ? {
          anchor: at(goto.range.line, goto.range.column),
          head: at(goto.range.endLine, goto.range.endColumn),
        }
      : word
        ? {
            anchor: doc.line(word.line + 1).from + word.from,
            head: doc.line(word.line + 1).from + word.to,
          }
        : { anchor: line.from };
    view.dispatch({
      selection,
      effects: EditorView.scrollIntoView(selection.anchor, { y: "center" }),
    });
    view.focus();
  }, [goto, path]);

  // UI language for the search panel and folding labels.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: phrases.current.reconfigure(editorPhrases(locale)) });
  }, [locale]);

  // Automatic indentation mode (Settings / «Ver» menu), applied live. Other tabs' states
  // pick it up when they are recreated; the active one is reconfigured here.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: indent.current.reconfigure(indentation(indentMode)) });
  }, [indentMode]);

  // Forget the state of closed tabs.
  const openFiles = useProjectView((s) => s.openFiles);
  useEffect(() => {
    for (const file of states.current.keys()) {
      if (!openFiles.includes(file)) states.current.delete(file);
    }
  }, [openFiles]);

  return <div ref={hostRef} className="h-full" data-testid="code-editor" />;
}
