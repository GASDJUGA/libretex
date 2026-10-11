/**
 * Math preview (5.5): while the cursor is inside a formula, a tooltip under it shows the
 * rendered result (MathJax SVG, bundled), updated as you type. TeX errors appear as a red
 * message; nothing here can break the editor.
 */
import {
  EditorSelection,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import {
  EditorView,
  keymap,
  showTooltip,
  ViewPlugin,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view";
import type { MathRegion } from "../lib/latexMath/regions";
import type { MathJaxMacros } from "../lib/macros/extract";
import { stripComments } from "../lib/macros/extract";
import { sanitizeSvg } from "../lib/mathjax/sanitize";
import { mathRegionInState } from "./mathRegion";

/** Pause after a change before rendering (5.5: ~100 ms). */
export const PREVIEW_DELAY_MS = 100;

export type MathPreviewOptions = {
  /** Whether the preview is on (setting). */
  enabled: () => boolean;
  /** The user's macros (preamble), read at each render. */
  macros: () => MathJaxMacros;
  /** Label for errors («Error en la fórmula»). */
  errorLabel: () => string;
};

type Preview = {
  /** Identifies the formula (its start), to keep the tooltip while typing in it. */
  regionFrom: number;
  /** Where the tooltip is anchored. */
  pos: number;
  content: { svg: string } | { error: string };
};

const setPreview = StateEffect.define<Preview | null>();
/** Esc: hidden until the cursor goes to another formula. */
const dismiss = StateEffect.define<null>();

type PreviewState = {
  preview: Preview | null;
  /** Kept while the anchor stays: its content is updated in place (no flicker). */
  tooltip: Tooltip | null;
  dismissedFrom: number | null;
};

const previewField: StateField<PreviewState> = StateField.define<PreviewState>({
  create: () => ({ preview: null, tooltip: null, dismissedFrom: null }),
  update(value, tr) {
    let { preview, dismissedFrom } = value;
    if (preview && tr.docChanged) {
      preview = {
        ...preview,
        regionFrom: tr.changes.mapPos(preview.regionFrom),
        pos: tr.changes.mapPos(preview.pos),
      };
    }
    if (dismissedFrom !== null && tr.docChanged) dismissedFrom = tr.changes.mapPos(dismissedFrom);
    for (const effect of tr.effects) {
      if (effect.is(setPreview)) preview = effect.value;
      if (effect.is(dismiss)) {
        dismissedFrom = preview?.regionFrom ?? null;
        preview = null;
      }
    }
    if (preview === value.preview && dismissedFrom === value.dismissedFrom) return value;
    const tooltip =
      preview && value.tooltip?.pos === preview.pos
        ? value.tooltip
        : preview
          ? makeTooltip(preview.pos)
          : null;
    return { preview, tooltip, dismissedFrom };
  },
  provide: (field) => showTooltip.from(field, (value) => value.tooltip),
});

function makeTooltip(pos: number): Tooltip {
  return {
    pos,
    above: false,
    strictSide: false,
    arrow: false,
    create: (view) => {
      const dom = document.createElement("div");
      let shown: Preview | null = null;
      const render = (preview: Preview | null) => {
        if (!preview || preview === shown) return;
        shown = preview;
        fillPreview(dom, preview);
      };
      render(view.state.field(previewField).preview);
      return { dom, update: (update) => render(update.state.field(previewField).preview) };
    },
  };
}

function fillPreview(dom: HTMLElement, preview: Preview) {
  const svg = "svg" in preview.content ? sanitizeSvg(preview.content.svg) : null;
  dom.replaceChildren();
  if (svg) {
    dom.className = "lt-math-preview";
    dom.removeAttribute("role");
    dom.append(svg);
  } else {
    dom.className = "lt-math-preview lt-math-error";
    dom.setAttribute("role", "alert");
    dom.textContent = "error" in preview.content ? preview.content.error : "";
  }
}

/**
 * Where the tooltip goes: under the formula's last visual row (wrapped lines included), at
 * that row's start, so it never covers the formula being typed.
 */
function anchorFor(view: EditorView, region: MathRegion): number {
  const rowStart = view.moveToLineBoundary(EditorSelection.cursor(region.to), false, true).head;
  return Math.max(region.from, rowStart);
}

/** The TeX to render for a region (comments removed). */
export function regionTex(state: EditorState, region: MathRegion): string {
  return stripComments(state.sliceDoc(region.bodyFrom, region.bodyTo));
}

let renderer: Promise<typeof import("../lib/mathjax/render")> | null = null;
const loadRenderer = () => (renderer ??= import("../lib/mathjax/render"));

function previewPlugin(options: MathPreviewOptions) {
  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | undefined;
      /** Increases with each request: a late render for an older text is dropped. */
      generation = 0;

      constructor(readonly view: EditorView) {
        this.schedule();
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.focusChanged) this.schedule();
      }

      schedule() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.render(), PREVIEW_DELAY_MS);
      }

      async render() {
        const { view } = this;
        const generation = ++this.generation;
        const { state } = view;
        const { preview, dismissedFrom } = state.field(previewField);
        const selection = state.selection.main;
        const region =
          options.enabled() && selection.empty ? mathRegionInState(state, selection.head) : null;
        if (!region || region.from === dismissedFrom || region.bodyFrom === region.bodyTo) {
          if (preview) view.dispatch({ effects: setPreview.of(null) });
          return;
        }
        const tex = regionTex(state, region);
        let content: Preview["content"];
        try {
          const { renderTex } = await loadRenderer();
          content = { svg: await renderTex(tex, region.display, options.macros()) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          content = { error: `${options.errorLabel()}: ${message}` };
        }
        // Typing went on or the editor closed meanwhile: a newer render will come.
        if (generation !== this.generation || !view.dom.isConnected) return;
        view.dispatch({
          effects: setPreview.of({
            regionFrom: region.from,
            pos: anchorFor(view, region),
            content,
          }),
        });
      }

      destroy() {
        clearTimeout(this.timer);
        this.generation++;
      }
    },
  );
}

/** The math preview extension. */
export function mathPreview(options: MathPreviewOptions): Extension {
  return [
    previewField,
    previewPlugin(options),
    keymap.of([
      {
        key: "Escape",
        run: (view) => {
          if (!view.state.field(previewField).preview) return false;
          view.dispatch({ effects: dismiss.of(null) });
          return true;
        },
      },
    ]),
  ];
}

/** Whether a preview is shown (for tests and the hover option). */
export function previewShown(state: EditorState): boolean {
  return state.field(previewField, false)?.preview != null;
}
