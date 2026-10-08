import { ChevronDown, Columns2, Download, History } from "lucide-react";
import { compilerLabels } from "../../mocks/projects";
import { useAppStore } from "../../store/app";
import { useProjectView, type LayoutMode } from "../../store/project";
import { Logo } from "../common/Logo";
import { Menu, type MenuEntry } from "../common/Menu";

type TopBarProps = {
  projectName: string;
  mainFile: string;
};

const sep = { kind: "separator" } as const;

export function TopBar({ projectName, mainFile }: TopBarProps) {
  const goHome = useAppStore((s) => s.goHome);
  const { layoutMode, setLayoutMode, compiler, setCompiler, sidePanelOpen, setSidePanelOpen } =
    useProjectView();

  const layoutEntries = (
    [
      ["split", "Editor y PDF"],
      ["editor", "Solo editor"],
      ["pdf", "Solo PDF"],
    ] as [LayoutMode, string][]
  ).map(([mode, label]): MenuEntry => ({
    label,
    checked: layoutMode === mode,
    radio: true,
    onSelect: () => setLayoutMode(mode),
  }));
  layoutEntries.push({ label: "PDF en ventana aparte", disabled: true, hint: "Próximamente" });

  const menus: [string, MenuEntry[]][] = [
    [
      "Archivo",
      [
        { label: "Nuevo archivo" },
        { label: "Nueva carpeta" },
        { label: "Subir archivos…" },
        sep,
        { label: "Guardar", shortcut: "Ctrl+S" },
        { label: "Compilar", shortcut: "Ctrl+Enter" },
        sep,
        { label: "Exportar PDF…" },
        { label: "Exportar ZIP de fuentes…" },
        sep,
        { label: "Volver al inicio", onSelect: goHome },
      ],
    ],
    [
      "Editar",
      [
        { label: "Deshacer", shortcut: "Ctrl+Z" },
        { label: "Rehacer", shortcut: "Ctrl+Shift+Z" },
        sep,
        { label: "Comentar línea", shortcut: "Ctrl+/" },
        sep,
        { label: "Buscar y reemplazar", shortcut: "Ctrl+F" },
        { label: "Buscar en el proyecto", shortcut: "Ctrl+Shift+F" },
      ],
    ],
    [
      "Insertar",
      [
        { label: "Matemática en línea" },
        { label: "Matemática destacada" },
        { label: "Símbolo…" },
        sep,
        { label: "Figura…" },
        { label: "Tabla…" },
        { label: "Lista con viñetas" },
        { label: "Lista numerada" },
        sep,
        { label: "Enlace" },
        { label: "Referencia cruzada (\\ref)" },
        { label: "Cita (\\cite)" },
      ],
    ],
    [
      "Ver",
      [
        ...layoutEntries,
        sep,
        {
          label: "Panel lateral",
          checked: sidePanelOpen,
          onSelect: () => setSidePanelOpen(!sidePanelOpen),
        },
      ],
    ],
    [
      "Formato",
      [
        { label: "Negrita", shortcut: "Ctrl+B" },
        { label: "Cursiva", shortcut: "Ctrl+I" },
        sep,
        { label: "Sección" },
        { label: "Subsección" },
        { label: "Subsubsección" },
      ],
    ],
    [
      "Ayuda",
      [
        { label: "Atajos de teclado" },
        { label: "Documentación de LaTeX" },
        sep,
        { label: "Acerca de LibreTeX" },
      ],
    ],
  ];

  const projectEntries: MenuEntry[] = [
    { label: "Renombrar proyecto…" },
    { label: "Ajustes del proyecto…" },
    sep,
    { kind: "label", label: "Archivo principal" },
    { label: mainFile, checked: true, radio: true },
    sep,
    { kind: "label", label: "Compilador" },
    ...(Object.keys(compilerLabels) as (keyof typeof compilerLabels)[]).map((c): MenuEntry => ({
      label: compilerLabels[c],
      checked: compiler === c,
      radio: true,
      onSelect: () => setCompiler(c),
    })),
  ];

  return (
    <header className="relative flex h-11 shrink-0 items-center gap-1 border-b border-black/30 bg-topbar px-2">
      <button
        type="button"
        onClick={goHome}
        title="Volver al inicio"
        aria-label="Volver al inicio"
        className="mr-1 rounded p-1 hover:bg-hover"
      >
        <Logo size={26} />
      </button>

      <nav aria-label="Menú principal" className="flex items-center">
        {menus.map(([label, entries]) => (
          <Menu key={label} trigger={label} entries={entries} />
        ))}
      </nav>

      <div className="absolute left-1/2 -translate-x-1/2">
        <Menu
          trigger={
            <>
              <span className="max-w-80 truncate font-medium">{projectName}</span>
              <ChevronDown size={14} aria-hidden />
            </>
          }
          label={`Proyecto ${projectName}`}
          entries={projectEntries}
        />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          className="flex h-8 items-center gap-1.5 rounded px-2 text-sm hover:bg-hover"
        >
          <History size={16} aria-hidden /> Historial
        </button>
        <Menu
          trigger={
            <>
              <Columns2 size={16} aria-hidden /> Diseño <ChevronDown size={14} aria-hidden />
            </>
          }
          entries={layoutEntries}
          align="end"
        />
        <Menu
          trigger={
            <>
              <Download size={16} aria-hidden /> Exportar
            </>
          }
          entries={[{ label: "PDF" }, { label: "ZIP de fuentes" }]}
          align="end"
          triggerClassName="flex h-8 items-center gap-1.5 rounded bg-panel-raised px-3 text-sm hover:bg-hover"
        />
      </div>
    </header>
  );
}
