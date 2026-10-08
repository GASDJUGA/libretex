export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
};

/** Templates shipped in templates/ (Phase 2). The first one is the default. */
export const mockTemplates: TemplateInfo[] = [
  {
    id: "articulo-xelatex-es",
    name: "Artículo XeLaTeX en español",
    description: "XeLaTeX + babel (español), fontspec y AMS.",
  },
  { id: "apuntes", name: "Apuntes de curso", description: "Capítulos, teoremas y ejemplos." },
  { id: "tarea", name: "Tarea / informe", description: "Portada, preguntas y respuestas." },
  { id: "beamer", name: "Presentación Beamer", description: "Diapositivas con Beamer." },
];
