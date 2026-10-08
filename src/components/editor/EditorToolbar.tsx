import {
  Bold,
  Hash,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Omega,
  Quote,
  Radical,
  Redo2,
  Search,
  SquareSigma,
  Table,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useProjectView } from "../../store/project";

type Tool = [label: string, Icon: LucideIcon];

const groups: Tool[][] = [
  [
    ["Deshacer (Ctrl+Z)", Undo2],
    ["Rehacer (Ctrl+Shift+Z)", Redo2],
  ],
  [
    ["Negrita (Ctrl+B)", Bold],
    ["Cursiva (Ctrl+I)", Italic],
  ],
  [
    ["Matemática en línea", Radical],
    ["Matemática destacada", SquareSigma],
    ["Símbolos", Omega],
  ],
  [
    ["Enlace", Link],
    ["Referencia cruzada (\\ref)", Hash],
    ["Cita (\\cite)", Quote],
  ],
  [
    ["Insertar figura", ImagePlus],
    ["Insertar tabla", Table],
    ["Lista con viñetas", List],
    ["Lista numerada", ListOrdered],
  ],
  [["Buscar y reemplazar (Ctrl+F)", Search]],
];

const headingLevels = ["Normal", "Sección", "Subsección", "Subsubsección", "Párrafo"];

export function EditorToolbar() {
  const editorMode = useProjectView((s) => s.editorMode);

  return (
    <div
      role="toolbar"
      aria-label="Herramientas del editor"
      className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-panel px-2"
    >
      <div
        role="radiogroup"
        aria-label="Modo del editor"
        className="mr-1 flex shrink-0 rounded bg-topbar p-0.5 text-xs"
      >
        <button
          type="button"
          role="radio"
          aria-checked={editorMode === "code"}
          className="rounded px-2.5 py-1 font-medium aria-checked:bg-accent aria-checked:text-accent-fg"
        >
          Código
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={editorMode === "visual"}
          disabled
          title="Próximamente"
          className="flex items-center gap-1 rounded px-2.5 py-1 text-fg-muted"
        >
          Visual
          <span className="rounded bg-panel-raised px-1 text-[10px]">Próximamente</span>
        </button>
      </div>

      {groups.map((group, i) => (
        <div key={i} className="flex shrink-0 items-center gap-0.5 border-l border-line pl-1">
          {i === 1 && (
            <select
              aria-label="Nivel de título"
              defaultValue="Normal"
              className="mr-1 h-7 rounded border border-line bg-topbar px-1 text-xs text-fg"
            >
              {headingLevels.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          )}
          {group.map(([label, Icon]) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              className="flex h-7 w-7 items-center justify-center rounded text-fg-muted hover:bg-hover hover:text-fg"
            >
              <Icon size={16} aria-hidden />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
