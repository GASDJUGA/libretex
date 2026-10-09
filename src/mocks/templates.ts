import type { TemplateInfo } from "../store/types";

/** Same templates as templates/ (the app reads them from the bundled resources). */
export const mockTemplates: TemplateInfo[] = [
  {
    id: "articulo-xelatex-es",
    name: { es: "Artículo XeLaTeX en español", en: "XeLaTeX article in Spanish" },
    description: {
      es: "Artículo con XeLaTeX, babel en español, AMS y bibliografía.",
      en: "Article with XeLaTeX, Spanish babel, AMS and bibliography.",
    },
    mainFile: "main.tex",
    compiler: "xelatex",
    default: true,
  },
  {
    id: "apuntes",
    name: { es: "Apuntes de curso", en: "Course notes" },
    description: {
      es: "Capítulos en archivos separados, teoremas, definiciones y ejemplos.",
      en: "Chapters in separate files, theorems, definitions and examples.",
    },
    mainFile: "main.tex",
    compiler: "xelatex",
    default: false,
  },
  {
    id: "tarea",
    name: { es: "Tarea / informe", en: "Homework / report" },
    description: {
      es: "Encabezado con curso y estudiante, preguntas numeradas y respuestas.",
      en: "Header with course and student, numbered questions and answers.",
    },
    mainFile: "main.tex",
    compiler: "xelatex",
    default: false,
  },
  {
    id: "beamer",
    name: { es: "Presentación Beamer", en: "Beamer presentation" },
    description: {
      es: "Diapositivas 16:9 con Beamer y XeLaTeX.",
      en: "16:9 slides with Beamer and XeLaTeX.",
    },
    mainFile: "main.tex",
    compiler: "xelatex",
    default: false,
  },
];
