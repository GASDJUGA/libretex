import { forEachDiagnostic, forceLinting } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { checkDiagnostics, liveCheck, showCompileDiagnostics } from "./liveCheck";

let enabled = true;
const options = {
  message: (p: { code: string }) => `problema ${p.code}`,
  source: "Revisión",
  enabled: () => enabled,
};

const views: EditorView[] = [];
function view(doc: string) {
  const v = new EditorView({
    state: EditorState.create({ doc, extensions: [liveCheck(options)] }),
    parent: document.body,
  });
  views.push(v);
  return v;
}

/** Severity, line and message of every diagnostic. */
function diagnostics(v: EditorView) {
  const found: [string, number, string][] = [];
  forEachDiagnostic(v.state, (d, from) =>
    found.push([d.severity, v.state.doc.lineAt(from).number, d.message]),
  );
  return found;
}

describe("liveCheck", () => {
  afterEach(() => {
    enabled = true;
    views.splice(0).forEach((v) => v.destroy());
  });

  it("convierte los problemas en diagnósticos de error", () => {
    expect(checkDiagnostics("a {b", options)).toEqual([
      { from: 2, to: 3, severity: "error", message: "problema unclosedBrace", source: "Revisión" },
    ]);
  });

  it("marca mientras se escribe, sin compilar", async () => {
    const v = view("\\begin{itemize}\n\\item a\n\\end{itemize}\n");
    forceLinting(v);
    await waitFor(() => expect(diagnostics(v)).toEqual([]));
    v.dispatch({ changes: { from: v.state.doc.line(2).to, insert: " \\textbf{b" } });
    forceLinting(v);
    await waitFor(() => expect(diagnostics(v)).toEqual([["error", 2, "problema unclosedBrace"]]));
  });

  it("junta los diagnósticos de la compilación con los de la revisión", async () => {
    const v = view("uno\ndos {\ntres\n");
    showCompileDiagnostics(v, [{ from: 10, to: 14, severity: "warning", message: "del log" }]);
    await waitFor(() =>
      expect(diagnostics(v).sort()).toEqual([
        ["error", 2, "problema unclosedBrace"],
        ["warning", 3, "del log"],
      ]),
    );
    // Compilation diagnostics follow edits made before the next compilation.
    v.dispatch({ changes: { from: 0, insert: "cero\n" } });
    forceLinting(v);
    await waitFor(() => expect(diagnostics(v)).toContainEqual(["warning", 4, "del log"]));
  });

  it("desactivada solo quedan los de la compilación", async () => {
    enabled = false;
    const v = view("{ sin cerrar");
    showCompileDiagnostics(v, [{ from: 0, to: 1, severity: "error", message: "del log" }]);
    await waitFor(() => expect(diagnostics(v)).toEqual([["error", 1, "del log"]]));
  });
});
