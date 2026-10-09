/** Sample project contents for the UI skeleton (Phase 1). */

/**
 * Files of the sample projects for the browser preview and tests: path → text content, or
 * `null` for binary files. Folders are implied by the paths.
 */
export function mockProjectFiles(): Record<string, string | null> {
  return {
    "main.tex": mockMainTex,
    "preambulo.tex": "% Paquetes y macros compartidos\n\\usepackage{amsmath}\n",
    "referencias.bib": "@book{knuth1984,\n  title = {The TeXbook},\n  year = {1984}\n}\n",
    "capitulos/introduccion.tex": "\\section{Introducción}\nTexto de la introducción.\n",
    "capitulos/marco-teorico.tex": "\\section{Marco teórico}\n",
    "capitulos/resultados.tex": "\\section{Resultados}\n",
    "figuras/montaje.png": null,
    "figuras/espectro.pdf": null,
  };
}

export type OutlineItem = {
  level: 0 | 1 | 2 | 3 | 4;
  title: string;
  line: number;
};

export const mockOutline: OutlineItem[] = [
  { level: 1, title: "Introducción", line: 18 },
  { level: 2, title: "Motivación", line: 21 },
  { level: 2, title: "Objetivos", line: 29 },
  { level: 1, title: "Marco teórico", line: 36 },
  { level: 2, title: "Vectores unitarios", line: 38 },
  { level: 3, title: "Ejemplo en coordenadas cartesianas", line: 44 },
  { level: 1, title: "Resultados", line: 52 },
];

export const mockMainTex = String.raw`\documentclass[12pt]{article}
\usepackage{fontspec}
\usepackage[spanish]{babel}
\usepackage{amsmath, amssymb}
\usepackage{graphicx}
\usepackage{hyperref}

\newcommand{\ihat}{\boldsymbol{\hat{\textbf{\i}}}}
\newcommand{\jhat}{\boldsymbol{\hat{\textbf{\j}}}}

\title{Tesis de magíster}
\author{Autora o autor}
\date{\today}

\begin{document}
\maketitle

\section{Introducción}
Este documento es un ejemplo para el esqueleto de LibreTeX.

\subsection{Motivación}
Los editores en línea son cómodos, pero dependen de una conexión
y de un servidor ajeno. LibreTeX compila todo de forma local.

% TODO: ampliar con antecedentes
Ver la sección~\ref{sec:marco} y la referencia~\cite{knuth1984}.

\subsection{Objetivos}
\begin{itemize}
  \item Editar con vista previa del PDF.
  \item Ver errores enlazados al código.
\end{itemize}

\section{Marco teórico}
\label{sec:marco}
\subsection{Vectores unitarios}
Todo vector del plano se escribe como $\vec{v} = a\ihat + b\jhat$.

\begin{align*}
  \vec{F} &= m\vec{a} \\
  \nabla \cdot \vec{E} &= \frac{\rho}{\varepsilon_0}
\end{align*}

\subsubsection{Ejemplo en coordenadas cartesianas}
\begin{equation}
  \lVert \vec{v} \rVert = \sqrt{a^2 + b^2}
\end{equation}

\begin{figure}[h]
  \centering
  \includegraphics[width=0.6\linewidth]{figuras/montaje.png}
  \caption{Montaje experimental.}
\end{figure}

\section{Resultados}
Los resultados se resumen en la tabla siguiente.

\bibliographystyle{plain}
\bibliography{referencias}
\end{document}
`;
