import { EditorState } from "@codemirror/state";
import type { Locale } from "../i18n";

/** Spanish texts for CodeMirror's built-in UI (search panel, folding, completion). */
const es: Record<string, string> = {
  Find: "Buscar",
  Replace: "Reemplazar",
  next: "siguiente",
  previous: "anterior",
  all: "todo",
  "match case": "mayúsc./minúsc.",
  "by word": "palabra completa",
  regexp: "expresión regular",
  replace: "reemplazar",
  "replace all": "reemplazar todo",
  close: "cerrar",
  "current match": "coincidencia actual",
  "replaced $ matches": "$ coincidencias reemplazadas",
  "replaced match on line $": "coincidencia reemplazada en la línea $",
  "on line": "en la línea",
  "Go to line": "Ir a la línea",
  go: "ir",
  "Folded lines": "Líneas plegadas",
  "Unfolded lines": "Líneas desplegadas",
  to: "a",
  "folded code": "código plegado",
  unfold: "desplegar",
  "Fold line": "Plegar línea",
  "Unfold line": "Desplegar línea",
  Completions: "Sugerencias",
};

export function editorPhrases(locale: Locale) {
  return locale === "es" ? EditorState.phrases.of(es) : [];
}
