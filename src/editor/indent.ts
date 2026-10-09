import { indentService, syntaxTree } from "@codemirror/language";
import { countColumn, type EditorState, type Extension } from "@codemirror/state";
import type { IndentMode } from "../store/settings";

/** Grammar nodes whose body should not be indented in the `environments` mode. */
const UNINDENTED = new Set([
  "Book",
  "Part",
  "Chapter",
  "Section",
  "SubSection",
  "SubSubSection",
  "Paragraph",
  "SubParagraph",
  "DocumentEnvironment",
]);

/** Nodes that do indent their body (environments and brace groups). */
const INDENTED = new Set(["Environment", "KnownEnvironment", "Group", "TextArgument", "LongArg"]);

/** Indentation (in columns) of the closest non-blank line before `pos`. */
function previousLineIndent(state: EditorState, pos: number): number {
  for (let line = state.doc.lineAt(pos); line.number > 1;) {
    line = state.doc.line(line.number - 1);
    if (line.text.trim() !== "") {
      return countColumn(/^\s*/.exec(line.text)![0], state.tabSize);
    }
  }
  return 0;
}

/**
 * The innermost structural node around `pos`: an environment/group (indent) or a
 * section/document (keep). `KnownEnvironment` wraps the `document` environment too, so the
 * check looks at its child.
 */
function innermostBlock(state: EditorState, pos: number): "indent" | "keep" | null {
  for (let node = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent!) {
    if (UNINDENTED.has(node.name)) return "keep";
    if (INDENTED.has(node.name)) {
      if (node.name === "KnownEnvironment" && node.firstChild?.name === "DocumentEnvironment") {
        return "keep";
      }
      return "indent";
    }
    if (!node.parent) break;
  }
  return null;
}

/** Indentation behaviour for the chosen mode (`full` leaves the grammar's rules alone). */
export function indentation(mode: IndentMode): Extension {
  if (mode === "full") return [];
  return indentService.of((context, pos) => {
    if (mode === "none") return previousLineIndent(context.state, pos);
    // `environments`: defer to the grammar inside environments and groups.
    return innermostBlock(context.state, pos) === "indent"
      ? undefined
      : previousLineIndent(context.state, pos);
  });
}
