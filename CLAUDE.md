# CLAUDE.md — LibreTeX

> Este archivo es la fuente de verdad del proyecto. Léelo completo al inicio de cada sesión,
> retoma desde el primer ítem sin marcar del **Plan de construcción** y mantén actualizadas
> las secciones **Estado actual** y **Decisiones**.

---

## 1. Qué es LibreTeX

LibreTeX es un editor de LaTeX de escritorio con una experiencia similar a Overleaf, pero
**100 % local**: los proyectos viven en el disco del usuario, se compilan con la distribución
TeX instalada en la máquina y no hay servidores, cuentas ni telemetría.

Tiene tres grandes áreas:

1. **Inicio (homescreen):** lista de proyectos, crear/abrir/importar proyectos.
2. **Vista de proyecto:** editor de código + árbol de archivos + esquema + visor PDF, con
   compilación, errores enlazados al código y **preview de matemáticas en vivo**.
3. **Paquetes:** buscar, instalar, actualizar y desinstalar paquetes de LaTeX.

La única funcionalidad que usa la red es el gestor de paquetes (descargas desde CTAN /
TeX Live), y siempre de forma explícita a petición del usuario.

---

## 2. Entorno del desarrollador

- **SO:** Arch Linux, KDE Plasma sobre **Wayland**, GPU **NVIDIA**.
- **Shell del usuario: zsh.** Cuando le pidas que ejecute algo, da comandos compatibles con
  zsh/bash (`export VAR=valor`). Tus propios comandos en la herramienta
  Bash pueden ser bash normal.
- **GitHub CLI (`gh`) ya autenticado.** Verifícalo igualmente en la Fase 0.
- El usuario trabaja habitualmente con **XeLaTeX + babel (español)**: es el caso de uso
  principal y la plantilla por defecto.
- **Nunca uses `sudo`.** Si falta un paquete del sistema, detente y entrégale al usuario el
  comando exacto de `pacman` para que lo ejecute él.

---

## 3. Stack técnico

| Capa | Elección |
|---|---|
| Shell de escritorio | **Tauri 2** (backend en Rust) |
| Frontend | **React 18 + TypeScript + Vite**, gestor **pnpm** |
| Estilos | Tailwind CSS con tokens de diseño como variables CSS |
| Layout | `react-resizable-panels` |
| Estado | Zustand |
| Iconos | `lucide-react` |
| Editor | **CodeMirror 6**. Lenguaje LaTeX: probar `codemirror-lang-latex` (verificar en npm que exista y esté mantenido); si no sirve, usar `@codemirror/legacy-modes/mode/stex` vía `StreamLanguage` |
| PDF | `pdfjs-dist`, worker empaquetado localmente |
| Matemáticas | **MathJax** (v3 `mathjax-full` o v4 `@mathjax/src`; verifica cuál es la estable actual) con salida SVG, empaquetado localmente |
| Ortografía | `nspell` + diccionarios `dictionary-es` / `dictionary-en` empaquetados |
| Diff de historial | `@codemirror/merge` |
| Rust (crates) | `serde`, `serde_json`, `tokio`, `notify`, `walkdir`, `ignore`, `regex`, `zip`, `git2`, `trash`, `directories`, `thiserror` |
| Compilación | `latexmk` (pdfLaTeX / XeLaTeX / LuaLaTeX) |
| SyncTeX | CLI `synctex` (incluido en TeX Live) |
| Tests | Vitest + Testing Library (frontend), `cargo test` (Rust) |

**Fix obligatorio Wayland + NVIDIA:** WebKitGTK suele mostrar ventanas en blanco o fallar en
esta combinación. En `main.rs`, en Linux y solo si la variable no está definida, establece
`WEBKIT_DISABLE_DMABUF_RENDERER=1` antes de construir la app (en Rust edición 2024
`std::env::set_var` requiere bloque `unsafe`; documéntalo).

Cualquier dependencia nueva fuera de esta tabla debe justificarse en la sección **Decisiones**.

---

## 4. Principios no negociables

1. **Local primero.** Nada de CDNs en tiempo de ejecución: fuentes, MathJax, worker de pdf.js
   y diccionarios van empaquetados. Sin telemetría ni analytics.
2. **Seguridad.**
   - El frontend nunca ejecuta comandos arbitrarios: solo invoca comandos Tauri tipados.
   - Toda ruta recibida del frontend se valida en Rust: `canonicalize` + comprobar que está
     dentro de la raíz del proyecto (sin path traversal, sin seguir symlinks hacia fuera).
   - Capabilities de Tauri mínimas; el protocolo de assets limitado a los directorios de
     proyectos y build.
   - Compilación con `-no-shell-escape` por defecto. `shell-escape` solo se activa por
     proyecto, con advertencia explícita (lo necesitan paquetes como `minted`).
3. **Nunca perder trabajo.** Autoguardado, escrituras atómicas (archivo temporal + `rename`),
   borrar = enviar a la papelera (`trash`), confirmación antes de acciones destructivas.
4. **Identidad propia.** El diseño se inspira en el layout de Overleaf, pero no se copian su
   logo, nombre ni assets. LibreTeX tiene logo y paleta propios.
5. **Idioma.** UI en español por defecto, preparada para i18n (`es`, `en`).
6. **Rendimiento.** El editor debe seguir fluido con archivos de varios miles de líneas; el
   visor PDF renderiza páginas de forma perezosa.

---

## 5. Especificación funcional

### 5.1 Inicio (homescreen)

- Navegación lateral con pestañas: **Proyectos**, **Papelera**, **Paquetes**, **Ajustes**.
- **Papelera:** vista de los proyectos que LibreTeX envió a la papelera del sistema (registrados
  en `~/.local/share/libretex/trashed.json`), con **Restaurar** y **Eliminar definitivamente**
  (con confirmación). No es una segunda papelera: lo que se hace aquí también se ve en Dolphin.
- **Proyectos:**
  - Lista/tarjetas con nombre, ruta, última modificación y compilador; búsqueda y orden
    (recientes, nombre, fecha). Miniatura opcional de la primera página del último PDF.
  - **Nuevo proyecto:** vacío o desde plantilla (ver `templates/`): *Artículo XeLaTeX en
    español* (por defecto), *Apuntes de curso*, *Tarea / informe*, *Presentación Beamer*.
  - **Abrir carpeta existente:** detectar el archivo principal (el `.tex` con
    `\documentclass`); si hay varios, preguntar.
  - **Importar ZIP** (incluidos ZIPs exportados desde Overleaf).
  - Renombrar, duplicar, eliminar (papelera), "Mostrar en el gestor de archivos".
- Directorio de proyectos por defecto: `~/LibreTeX/` (configurable). Los proyectos fuera de
  ese directorio se registran por ruta.
- Metadatos por proyecto en `<proyecto>/.libretex/project.json`:
  `mainFile`, `compiler`, `autoCompile`, `shellEscape`, `spellLang`.
- Estado global en las rutas XDG (crate `directories` o la API de rutas de Tauri):
  configuración en `~/.config/libretex/` (`settings.json`, `projects.json`), caché en
  `~/.cache/libretex/`, datos en `~/.local/share/libretex/`.

### 5.2 Vista de proyecto (editor)

Debe replicar la distribución de la imagen de referencia del usuario (estilo Overleaf):

**Barra superior (oscura)**
- Izquierda: logo de LibreTeX (vuelve al inicio) y menús **Archivo, Editar, Insertar, Ver,
  Formato, Ayuda**.
- Centro: nombre del proyecto con desplegable (renombrar, ajustes del proyecto, archivo
  principal, compilador).
- Derecha: **Historial**, **Diseño** (editor + PDF / solo editor / solo PDF / PDF en ventana
  aparte) y **Exportar** (reemplaza al "Share" de Overleaf).

**Riel de iconos a la izquierda**
- Archivos, Buscar en el proyecto, Paquetes, Registros/errores. Abajo: Ayuda y Ajustes.

**Panel izquierdo** (redimensionable y colapsable), dividido verticalmente:
- **Árbol de archivos:** botones nuevo archivo, nueva carpeta, subir archivos, colapsar;
  menú contextual (renombrar, eliminar, duplicar, marcar como principal); arrastrar y soltar
  para mover y para subir desde el sistema; el archivo activo resaltado.
- **Esquema del archivo:** `\part` … `\subsubsection` del archivo actual (y de los
  `\input`/`\include`), clic navega a la línea, se resalta la sección donde está el cursor.

**Centro: editor**
- Pestañas de archivos abiertos.
- Barra de herramientas: deshacer, rehacer, selector de nivel de título, negrita, cursiva,
  matemática inline y display, paleta de símbolos (Ω), enlace, `\ref`, `\cite`, insertar
  figura, generador de tabla (filas × columnas), listas, buscar y reemplazar.
- Interruptor **Código / Visual**. En v1 el modo Visual queda deshabilitado con la etiqueta
  "Próximamente".
- CodeMirror con: números de línea, plegado de entornos (`\begin…\end`) y secciones,
  resaltado de sintaxis, línea activa resaltada, cierre automático de `{}`, `[]`, `$` y de
  entornos, autocompletado (comandos, entornos, `\ref` desde `\label` del proyecto, `\cite`
  desde los `.bib`, rutas en `\includegraphics`/`\input`), comentar con `Ctrl+/`, revisión
  ortográfica subrayada que ignora comandos, matemáticas y argumentos de `\ref`/`\label`/
  `\cite`.
- Diagnósticos de compilación como marcadores en el margen y subrayados en la línea.
- Imágenes (`png`, `jpg`, `pdf`) abiertas desde el árbol se muestran en un visor dentro del
  panel central.

**Panel derecho: PDF**
- Botón verde **Recompilar** con indicador de progreso y desplegable: compilación automática
  on/off, compilador (pdfLaTeX / XeLaTeX / LuaLaTeX), modo borrador, detener en el primer
  error, limpiar archivos auxiliares.
- Botón de registros con contador de errores/advertencias, botón de descarga del PDF.
- Visor con zoom, navegación por páginas y búsqueda (detalles en 5.4).

**General**
- Todos los divisores redimensionables; tamaños y paneles abiertos se recuerdan por proyecto.
- Tema por defecto como la referencia: interfaz oscura + editor claro. Alternativa: editor
  oscuro. Paleta propia **Índigo** (elegida por el usuario; tokens en `src/styles/index.css`):
  barra superior `#191b2a`, paneles `#242840`, texto `#e8e9f3`, acento violeta `#6b5ce7`,
  editor `#ffffff`. No imitar la paleta ni la disposición exacta de botones de Overleaf:
  Recompilar va en la barra superior y descargar el PDF está en Exportar.
- Atajos: `Ctrl+S` guardar (y compilar si la compilación automática está activa),
  `Ctrl+Enter` compilar (lo usa el usuario a diario), `Ctrl+Shift+S` descargar el PDF
  compilado (guardar como…), `Ctrl+B`/`Ctrl+I`, `Ctrl+F` buscar, `Ctrl+Shift+F` buscar en el
  proyecto, `Ctrl+/` comentar, doble clic en el PDF salta al código.

### 5.3 Compilación

- El backend ejecuta, desde la raíz del proyecto:
  `latexmk -<motor> -synctex=1 -interaction=nonstopmode -file-line-error -outdir=.libretex/build <mainFile>`
  donde `<motor>` es `pdf`, `xelatex` o `lualatex`; `-halt-on-error` según la opción
  "detener en el primer error". `latexmk` se encarga de BibTeX/Biber y de las pasadas extra.
- La salida se transmite en vivo al panel de registros vía eventos de Tauri. Botón para
  cancelar (matar el grupo de procesos completo).
- Nunca dos compilaciones simultáneas del mismo proyecto: si llega una petición durante otra,
  se encola solo la más reciente.
- Compilación automática: con debounce (por defecto 1,5 s) tras guardar.
- **Parser de logs** en TypeScript (`src/lib/latexLog/`), con tests sobre logs reales en
  `tests/fixtures/logs/`. Clasifica:
  - Errores (`archivo:línea: mensaje`, gracias a `-file-line-error`).
  - Advertencias (`LaTeX Warning`, `Package X Warning`, referencias/citas indefinidas).
  - Tipografía (`Overfull`/`Underfull \hbox`).
  - Archivo faltante (`! LaTeX Error: File 'x.sty' not found.`) → acción **"Instalar
    paquete"** que abre el gestor de paquetes (ver 5.6).
- Panel de registros: lista agrupada (Errores / Advertencias / Tipografía), clic navega al
  archivo y la línea; botón para ver el log crudo.
- Si no se encuentra `latexmk` o el motor, mostrar un aviso con instrucciones de instalación
  para Arch (por ejemplo los grupos `texlive-basic`, `texlive-latexextra`, `texlive-xetex`,
  `texlive-langspanish`, `texlive-binextra`; verifica los nombres con `pacman -Ss texlive`)
  y la opción de instalar el TeX Live gestionado por LibreTeX (5.6).
- `.libretex/build/` se excluye del árbol de archivos visible.

### 5.4 Visor PDF

- `pdfjs-dist` con renderizado perezoso de páginas (solo las visibles y cercanas).
- Zoom: ajustar al ancho, ajustar a la página, porcentajes. **Al recompilar se conservan la
  página, el scroll y el zoom** (sin saltos ni parpadeo).
- Búsqueda de texto en el PDF. Modo oscuro opcional (inversión de colores).
- **SyncTeX:**
  - Directo (código → PDF): botón y atajo; usa
    `synctex view -i "<línea>:<columna>:<archivo>" -o "<pdf>"` y resalta la zona en el PDF.
  - Inverso (PDF → código): doble clic en el PDF; usa
    `synctex edit -o "<página>:<x>:<y>:<pdf>"` y mueve el cursor a la línea.
  - El parseo de la salida de `synctex` vive en Rust, con tests.

### 5.5 Preview de matemáticas

Igual que Overleaf: cuando el cursor está dentro de una expresión matemática, aparece un
tooltip flotante bajo la expresión con el resultado renderizado, que se actualiza en vivo
mientras se escribe.

- Regiones detectadas: `$…$`, `\(…\)`, `$$…$$`, `\[…\]` y los entornos `equation`, `align`,
  `gather`, `multline`, `flalign`, `alignat`, `eqnarray`, `math`, `displaymath` (con y sin
  asterisco).
- Detección basada en el árbol sintáctico del lenguaje LaTeX de CodeMirror, con un escáner de
  respaldo. Casos con tests: `\$` escapado, comentarios `%`, `verbatim`/`lstlisting`,
  expresiones multilínea, `$` sin cerrar.
- Los entornos con `&` y `\\` (como `align`) se convierten al equivalente `aligned`/`gathered`
  para renderizarlos.
- Renderizado con MathJax TeX → SVG, con extensiones: `ams`, `boldsymbol`, `physics`,
  `braket`, `cancel`, `color`, `mathtools`, `textmacros`, `newcommand`. Los errores de
  sintaxis se muestran como mensaje en rojo dentro del tooltip; nunca deben romper el editor.
- **Macros del usuario:** se extraen del preámbulo (archivo principal y archivos incluidos)
  `\newcommand`, `\renewcommand`, `\DeclareMathOperator` y `\def` simples, y se pasan a
  MathJax. Se vuelven a extraer al cambiar el preámbulo.
  Test de aceptación obligatorio: estas macros reales del usuario deben renderizarse bien:
  ```latex
  \newcommand{\ihat}{\boldsymbol{\hat{\textbf{\i}}}}
  \newcommand{\jhat}{\boldsymbol{\hat{\textbf{\j}}}}
  ```
- Debounce ~100 ms; `Esc` cierra el tooltip; se puede desactivar en Ajustes. Opción
  adicional: preview al pasar el mouse sobre una expresión.

### 5.6 Gestor de paquetes

Accesible desde la pestaña **Paquetes** del inicio y desde el riel de iconos del editor.

**Backends** (se detectan al iniciar; el activo se muestra en la UI):

1. **TeX Live gestionado por LibreTeX (recomendado en Arch).** El TeX Live de `pacman` no
   permite instalar paquetes con `tlmgr`, así que LibreTeX ofrece un asistente que descarga
   `install-tl-unx.tar.gz` desde `https://mirror.ctan.org/systems/texlive/tlnet/` y hace una
   instalación de usuario en `~/.local/share/libretex/texlive/` con un archivo *profile*
   (esquema básico + XeTeX + `babel-spanish` + `latexmk`, sin modificar el PATH del sistema).
   Con este backend `tlmgr` funciona sin root, y LibreTeX lo antepone en el PATH al compilar.
2. **TeX Live oficial del sistema con `tlmgr` escribible** (por ejemplo `/usr/local/texlive`).
3. **TeX Live de pacman (solo lectura).** Muestra si un paquete está instalado (`kpsewhich`)
   y, si no lo está, el grupo de pacman que lo contiene cuando se pueda determinar
   (`pacman -F`), con un botón para copiar el comando `sudo pacman -S …`. LibreTeX nunca
   ejecuta `sudo`.
4. MiKTeX: fuera del alcance de v1.

**Búsqueda**
- Por nombre y descripción, combinando la base de datos de TeX Live (`tlmgr search`,
  `tlmgr info --json`; revisa las opciones exactas con `tlmgr help`) con la API JSON de CTAN
  (`https://ctan.org/json/2.0/packages`, `https://ctan.org/json/2.0/pkg/<nombre>`).
- El índice de CTAN se cachea en `~/.cache/libretex/ctan/` para poder buscar sin conexión;
  botón para actualizarlo.
- Ojo: el nombre en CTAN, el nombre en TeX Live y el archivo `.sty` no siempre coinciden;
  resuelve el mapeo (por ejemplo con `tlmgr search --global --file /x.sty`).

**Ficha de paquete**
- Nombre, descripción, versión, licencia y estado (instalado / no instalado / actualizable).
- Acciones: Instalar, Desinstalar, Actualizar, Abrir documentación (`texdoc`, local),
  Copiar `\usepackage{…}`, **Agregar al preámbulo del proyecto actual**.
- Las operaciones corren en segundo plano con barra de progreso y log; una a la vez.
- Integración con la compilación: un `.sty` faltante en el log ofrece instalar el paquete
  correspondiente con un clic y recompilar al terminar.

### 5.7 Historial y exportación

- Historial local con `git2` usando un *git dir* separado en `.libretex/history.git` (con el
  proyecto como *work tree*), para no interferir si el usuario ya usa git en su proyecto.
- Instantáneas automáticas (cada N minutos si hay cambios y tras cada compilación exitosa) y
  manuales con nombre ("Guardar versión").
- Panel de historial: lista de versiones, diff por archivo (`@codemirror/merge`), restaurar
  un archivo o el proyecto completo.
- Exportar: PDF, ZIP de fuentes (sin `.libretex/`), compatible con importar en Overleaf.

### 5.8 Ajustes

Fuente y tamaño del editor, tema del editor, keymap (normal / Vim / Emacs), retardo de
compilación automática, compilador por defecto, idioma de la UI, diccionario, directorio de
proyectos, ruta de la distribución TeX, preview matemático on/off, preview al pasar el mouse.

### Fuera de alcance en v1
Modo Visual (WYSIWYG), colaboración en tiempo real, sincronización en la nube, MiKTeX,
Windows/macOS (el código no debe impedirlos, pero solo se prueba en Linux).

---

## 6. Estructura del repositorio

```
libretex/
├─ CLAUDE.md
├─ README.md
├─ LICENSE                      # GPL-3.0-or-later
├─ docs/
│  └─ screenshots/
├─ .github/workflows/ci.yml
├─ src/                         # Frontend React
│  ├─ app/                      # Rutas: Home, Project
│  ├─ components/               # layout, filetree, outline, editor, pdf, logs,
│  │                            # packages, history, settings, common
│  ├─ editor/                   # Extensiones CM6: mathPreview, diagnostics,
│  │                            # autocomplete, outline, spellcheck, commands
│  ├─ lib/
│  │  ├─ latexLog/              # Parser de logs + tests
│  │  ├─ latexMath/             # Detección de regiones matemáticas + tests
│  │  ├─ macros/                # Extracción de macros del preámbulo + tests
│  │  └─ tauri.ts               # Wrappers tipados de los comandos Tauri
│  ├─ store/                    # Zustand
│  ├─ i18n/                     # es.json, en.json
│  └─ styles/
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs / lib.rs
│  │  ├─ commands/              # projects, files, compile, synctex, packages,
│  │  │                         # history, search, settings
│  │  ├─ tex/                   # detect, latexmk, tlmgr, pacman, ctan, install_tl
│  │  └─ util/paths.rs          # Validación de rutas
│  ├─ capabilities/
│  └─ tauri.conf.json
├─ templates/                   # articulo-xelatex-es, apuntes, tarea, beamer
└─ tests/fixtures/              # logs/, projects/, synctex/
```

---

## 7. Git y GitHub

**Puesta en marcha (Fase 0)**
1. `gh auth status`. Si falla, detente y pide al usuario que ejecute `gh auth login`.
2. `git init -b main`, `.gitignore` (node_modules, `dist/`, `src-tauri/target/`,
   `.libretex/`, archivos auxiliares de LaTeX fuera de `tests/fixtures/`).
3. Primer commit y crear el repo:
   `gh repo create libretex --private --source=. --remote=origin --push --description "Editor LaTeX local estilo Overleaf"`
   (privado salvo que el usuario indique lo contrario).

**Flujo continuo**
- Una rama por fase: `fase-N-nombre-corto`.
- **Cada ítem completado del plan = un commit + `git push` inmediato.** No acumules cambios
  sin subir.
- Mensajes en español con Conventional Commits: `feat(editor): …`, `fix(compile): …`,
  `test(latexLog): …`, `docs: …`, `chore: …`.
- Al terminar una fase: `gh pr create` con resumen y checklist de aceptación; cuando el CI
  esté verde, `gh pr merge --merge --delete-branch`, y luego tag `v0.N.0` con
  `git tag` + `git push --tags`.
- Prohibido: `git push --force`, reescribir historial ya subido, subir secretos, PDFs de
  build o binarios grandes.
- **CI** (`.github/workflows/ci.yml`, en PRs y en `main`): instalar dependencias de sistema
  de Tauri en Ubuntu (según la documentación oficial de Tauri 2), `pnpm lint`,
  `pnpm typecheck`, `pnpm test`, `cargo fmt --check`, `cargo clippy -- -D warnings`,
  `cargo test`.

---

## 8. Definición de terminado (para cada ítem)

Un ítem solo se marca `[x]` cuando:
1. `pnpm typecheck`, `pnpm lint`, `pnpm test` y `cargo test` pasan.
2. La lógica no trivial tiene tests (parsers, detección de matemáticas, validación de rutas,
   mapeo de paquetes, parseo de SyncTeX).
3. Se verificó manualmente con `pnpm tauri dev` (describe brevemente en el commit qué
   probaste).
4. Se actualizó este archivo (checkbox + **Estado actual**).
5. Commit y push hechos.

---

## 9. Plan de construcción

### Fase 0 — Preparación
- [x] Verificar entorno: `gh auth status`, `rustc`/`cargo`, `node`, `pnpm`, `latexmk -v`,
      `xelatex --version`, `synctex help`, `pacman -Q webkit2gtk-4.1`. Para lo que falte,
      entregar al usuario el comando de pacman (prerrequisitos de Tauri en Arch:
      `webkit2gtk-4.1 base-devel curl wget file openssl appmenu-gtk-module libappindicator-gtk3 librsvg`).
- [x] Scaffold con `create-tauri-app` (plantilla React + TypeScript, pnpm). Nombre de la
      ventana y del producto: **LibreTeX**; identificador `org.libretex.app`.
- [x] Tailwind, ESLint, Prettier, Vitest, `rustfmt`, `clippy`; scripts `lint`, `typecheck`,
      `test` en `package.json`.
- [x] Fix de WebKitGTK para Wayland + NVIDIA (sección 3).
- [x] `.gitignore`, `README.md` (qué es, cómo compilar, comandos para zsh/bash),
      `LICENSE` GPL-3.0-or-later.
- [x] `git init`, `gh repo create`, primer push, workflow de CI.
- **Aceptación:** `pnpm tauri dev` abre una ventana "LibreTeX" sin pantalla en blanco; CI verde.

### Fase 1 — Esqueleto de interfaz (datos falsos)
- [x] Tokens de diseño, tema oscuro de interfaz + editor claro, logo provisional propio.
- [x] Router Inicio ↔ Proyecto.
- [x] Layout de proyecto completo según 5.2: barra superior con menús, riel de iconos, panel
      izquierdo (árbol + esquema), editor central, panel PDF, divisores redimensionables.
- [x] Layout de inicio con pestañas Proyectos / Paquetes / Ajustes.
- [x] i18n base (es/en).
- **Aceptación:** la UI se parece estructuralmente a la referencia, con datos de ejemplo.

### Fase 2 — Proyectos e inicio
- [x] Comandos Rust: listar, crear (vacío y desde plantilla), abrir carpeta, importar ZIP,
      renombrar, duplicar, eliminar (papelera); registro en `projects.json`.
- [x] `util/paths.rs` con validación de rutas y tests de path traversal.
- [x] Plantillas en `templates/` (la de artículo usa XeLaTeX + babel español).
- [x] Homescreen funcional: búsqueda, orden, recientes, detección del archivo principal.
- [x] Papelera en la app (pedida por el usuario): listar, restaurar y eliminar definitivamente
      los proyectos que LibreTeX envió a la papelera del sistema.
- **Aceptación:** crear un proyecto desde plantilla y abrirlo lleva a la vista de proyecto.

### Fase 3 — Árbol de archivos
- [x] Comandos de archivos: leer, escribir (atómico), crear, renombrar, mover, eliminar, subir.
- [x] Watcher (`notify`) que refleja cambios externos en el árbol y en los buffers abiertos
      (preguntar si hay conflicto con cambios sin guardar).
- [x] Árbol con menú contextual, drag & drop (interno y desde el sistema), botones de la
      cabecera, marcar archivo principal, visor de imágenes.
- **Aceptación:** todas las operaciones funcionan y se reflejan en disco.

### Fase 4 — Editor
- [x] CodeMirror 6 con lenguaje LaTeX, pestañas, autoguardado, plegado, línea activa.
- [x] Barra de herramientas y menús conectados a comandos del editor (incluye generador de
      tablas y paleta de símbolos).
- [x] Autocompletado de comandos, entornos, `\ref`, `\cite`, rutas; cierre automático.
- [x] Esquema del archivo sincronizado con el cursor.
- [x] Interruptor Código/Visual (Visual deshabilitado, "Próximamente").
- **Aceptación:** se puede editar cómodamente un documento real de varios cientos de líneas.

### Fase 5 — Compilación y registros
- [ ] Detección de la distribución TeX y de los motores disponibles.
- [ ] Ejecución de `latexmk` con streaming de salida, cancelación y cola.
- [ ] Parser de logs con fixtures reales (pdfLaTeX, XeLaTeX con babel, errores de llaves,
      `.sty` faltante, referencias indefinidas, overfull boxes).
- [ ] Panel de registros, contador en el botón, diagnósticos en el editor, navegación.
- [ ] Botón Recompilar con su desplegable; compilación automática con debounce; atajo
      `Ctrl+Enter` para compilar desde cualquier parte de la vista de proyecto.
- **Aceptación:** un error introducido a propósito aparece marcado en la línea correcta.

### Fase 6 — Visor PDF y SyncTeX
- [ ] Visor pdf.js perezoso, zoom, búsqueda, modo oscuro opcional.
- [ ] Conservar posición y zoom entre recompilaciones.
- [ ] SyncTeX directo e inverso, con parseo testeado en Rust.
- **Aceptación:** doble clic en un párrafo del PDF lleva a su línea y viceversa.

### Fase 7 — Preview de matemáticas
- [ ] Detector de regiones matemáticas con tests (casos de 5.5).
- [ ] Extracción de macros del preámbulo con tests (incluye `\ihat` y `\jhat`).
- [ ] Tooltip con MathJax SVG empaquetado localmente, extensiones listadas, errores en rojo.
- [ ] Soporte de entornos con alineación, opción de hover y ajuste on/off.
- **Aceptación:** al escribir dentro de `align*` usando `\ihat`, el preview se actualiza en
      vivo y se ve correcto, sin conexión a internet.

### Fase 8 — Gestor de paquetes
- [ ] Detección de backends (5.6) y visualización del activo.
- [ ] Asistente de instalación del TeX Live gestionado por LibreTeX (con progreso y
      posibilidad de cancelar).
- [ ] Índice CTAN cacheado + búsqueda combinada + mapeo CTAN ↔ TeX Live ↔ `.sty`.
- [ ] Fichas de paquete con instalar / desinstalar / actualizar / documentación / agregar al
      preámbulo.
- [ ] Modo solo lectura para el TeX Live de pacman.
- [ ] Integración "`.sty` faltante → instalar → recompilar".
- **Aceptación:** con el backend gestionado, instalar un paquete no presente y compilar un
      documento que lo usa funciona de punta a punta.

### Fase 9 — Productividad
- [ ] Búsqueda y reemplazo en todo el proyecto (`Ctrl+Shift+F`, crate `ignore` + `regex`).
- [ ] Revisión ortográfica es/en con diccionario personal.
- [ ] Pantalla de Ajustes completa (5.8), keymaps Vim/Emacs.
- **Aceptación:** los ajustes persisten entre reinicios y se aplican en vivo.

### Fase 10 — Historial y exportación
- [ ] Historial con git dir separado, instantáneas automáticas y manuales.
- [ ] Panel con lista, diff y restauración.
- [ ] Exportar PDF y ZIP; atajo `Ctrl+Shift+S` para descargar el PDF compilado.
- **Aceptación:** restaurar una versión anterior recupera exactamente el contenido.

### Fase 11 — Pulido y distribución
- [ ] Revisión de accesibilidad básica (foco, atajos, contraste) y rendimiento.
- [ ] Capturas en `docs/screenshots/` y README final.
- [ ] `pnpm tauri build` (AppImage) y un `PKGBUILD` para Arch.
- [ ] `gh release create v1.0.0` con los artefactos.
- **Aceptación:** la app instalada desde el PKGBUILD funciona fuera del entorno de desarrollo.

---

## 10. Cómo trabajar (reglas para Claude Code)

- Al empezar una sesión: lee este archivo, revisa `git status` y `git log -5`, y continúa en
  el primer ítem sin marcar. No te adelantes de fase.
- Trabaja en incrementos pequeños y verificables; corre los tests antes de cada commit.
- Si una decisión de diseño no está cubierta aquí, elige la opción más simple coherente con
  los principios, regístrala en **Decisiones** y sigue. Pregunta al usuario solo si la
  decisión es difícil de revertir.
- No uses `sudo`. No instales nada global sin avisar.
- Antes de usar una API de una librería, verifica su versión y documentación actuales; no
  asumas firmas de memoria.
- Comandos útiles:
  - `pnpm tauri dev` — app en desarrollo
  - `pnpm test` / `pnpm typecheck` / `pnpm lint`
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`

---

## 11. Estado actual

- Fase en curso: **4 — Editor** (rama `fase-4-editor`). Fases 0–3 cerradas (tags `v0.0.0` …
  `v0.3.0`). Repo privado https://github.com/GASDJUGA/libretex
- Todos los ítems de la Fase 4 hechos; PR abierto. Pendiente: prueba del usuario en
  `pnpm tauri dev` con un documento real de varios cientos de líneas (criterio de
  aceptación), el diálogo de conflicto (editar sin guardar + cambiar el archivo fuera) y CI.
- Fase 3 probada por el usuario en `pnpm tauri dev` (operaciones del árbol, soltar desde
  Dolphin, visor de imágenes, cambios externos). Archivos borrados desde el árbol van solo a
  la papelera del sistema (la Papelera de la app es de proyectos); el usuario lo aceptó.
- Último hito: esquema real (`lib/outline.ts`: títulos con llaves anidadas, sin
  comentarios, archivos de `\input`/`\include` hasta 3 niveles sin bucles; `Outline.tsx`
  resalta la sección del cursor y salta con `goToLine` del store, también a otros archivos).
- Antes: autocompletado del proyecto (`files/index.rs` con `regex` → comando
  `project_index`; `store/projectIndex.ts`; `editor/completion.ts`: `\ref`, `\cite`,
  `\includegraphics`, `\input`, `\bibliography`, `\addbibresource`) combinado con el de
  comandos/entornos del paquete.
- Antes: barra y menús conectados (`editor/commands.ts` puros + tests,
  `editor/activeView.ts`, `Popover`, paleta de símbolos `editor/symbols.ts`, selector de tabla
  en cuadrícula, `Ctrl+B/I`); lo que llega en fases posteriores queda deshabilitado con
  «Próximamente». La barra se parte en dos filas si no cabe.
- Antes: editor CodeMirror 6 (`src/editor/setup.ts`, `theme.ts`, `phrases.ts`;
  `components/editor/CodeEditor.tsx`): una vista y un `EditorState` por pestaña, autoguardado
  a 1 s, `Ctrl+S`, cerrar pestaña guarda antes, recarga externa, cursor → `cursorLine`.
- Antes: árbol interactivo (`FileTree.tsx`: menú contextual `ContextMenu`, diálogos,
  F2/Supr, arrastrar para mover, soltar desde el sistema con `import_dropped`, marcar
  principal; el principal sigue a renombres/movimientos), visor de imágenes (`FileViewer`,
  protocolo de assets limitado a proyectos abiertos), `lib/paths.ts`.
- Antes: watcher (`files/watch.rs`, debounce 150 ms, ignora `.libretex/`, `.git/` y
  temporales; evento `project-files-changed`) + `store/buffers.ts` (contenido/guardado por
  archivo; `lib/reconcile.ts` decide recargar, ignorar o preguntar) + `ConflictDialog`. El
  conflicto solo se podrá probar a mano cuando haya edición (Fase 4).
- Antes: `src-tauri/src/files/mod.rs` (árbol, leer/escribir texto, crear, renombrar,
  mover, duplicar, borrar a la papelera, importar) + `commands/files.rs`; frontend con
  `Backend` ampliado, `lib/mockFiles.ts` (mismas reglas en memoria) y `store/files.ts`. El
  árbol y la vista provisional del editor ya muestran los archivos reales del proyecto.
- Fase 2 probada por el usuario en `pnpm tauri dev` (crear, duplicar, importar ZIP, mostrar en
  el gestor, quitar de la lista, papelera de la app: enviar, restaurar, eliminar).
- Homescreen: store `useProjects`, diálogos en `components/home/ProjectDialogs.tsx`, avisos
  `Toaster` + `lib/errors.ts`; `Project.tsx` abre el proyecto real. Menús desplegables en
  portal con posición fija (`lib/menuPosition.ts`).
- Antes: comandos Tauri de proyectos (`commands/projects.rs`) sobre `projects/ops.rs`
  (`Ctx` con rutas explícitas → testeable), `registry.rs` (`projects.json`), `detect.rs`
  (archivo principal, compilador), `zip_import.rs` (ZIP seguro); `state.rs` lee `projectsDir`
  de `settings.json` (por defecto `~/LibreTeX`). Diálogos nativos y «mostrar en el gestor» se
  hacen desde Rust: la webview solo tiene `core:default`.
- Antes: plantillas `templates/{articulo-xelatex-es,apuntes,tarea,beamer}` con
  `template.json` (nombre/descr. es/en, `mainFile`, `compiler`, `order`, `default`), empaquetadas
  como recursos de Tauri; `projects/templates.rs` y `projects/meta.rs` (`project.json`).
- Antes: `src-tauri/src/util/paths.rs` (`resolve_existing`, `resolve_new`, `to_relative`,
  `validate_name`), `util/fs.rs` (escritura atómica, JSON) y `error.rs` (`AppError` → `{code,
  message}` para el frontend).
- Orden de la fase: paths → plantillas → comandos → homescreen (por dependencias).
- Verificación visual: `.claude/launch.json` (servidor `vite-preview`, puerto 1430, para no
  chocar con el 1420 de `pnpm tauri dev`); mientras el frontend no use APIs de Tauri se ve
  igual que la ventana.
- Entorno verificado (2026-10-08): rustc 1.99, node 26, pnpm, latexmk 4.87, XeTeX TL 2026
  (pacman), synctex 1.5, webkit2gtk-4.1 2.52, `texlive-langspanish` instalado.
- Sin el fix de WebKit la ventana muere con `Gdk-Message: Error 71 (Protocol error)
  dispatching to Wayland display` (confirmado en esta máquina); con el fix (`main.rs`) el
  proceso sigue vivo.
- Bloqueos: —

## 12. Decisiones

| Fecha | Decisión | Motivo |
|---|---|---|
| — | Tauri 2 en vez de Electron | App más liviana; usa WebKitGTK del sistema |
| — | Historial con git dir separado | No interferir con repos git del usuario |
| — | TeX Live de usuario gestionado por LibreTeX | El TeX Live de pacman no permite `tlmgr install` |
| 2026-10-08 | React 19 en vez de 18 | Es lo que trae `create-tauri-app` y la versión estable actual; las librerías del stack la soportan |
| 2026-10-08 | Rust edición 2024, `rust-version = 1.90` | Edición prevista en la sección 3; 1.90 es el MSRV de tauri 2.12 (con 1.85 cargo se quedaba en 2.11, desalineado con `@tauri-apps/api`) |
| 2026-10-08 | Tailwind v4 (`@tailwindcss/vite`), ESLint 10 flat config, Vitest 5 configurado en `vite.config.ts` | Versiones estables actuales; Tailwind v4 no necesita PostCSS ni `tailwind.config` |
| 2026-10-08 | `pnpm lint` = `eslint . && prettier --check .` | Un solo script para estilo y formato en CI |
| 2026-10-08 | CI: Node 26, pnpm fijado con `packageManager` (pnpm@11.28.5), jobs separados frontend/Rust | Misma versión que la máquina del desarrollador; Rust cachea con `rust-cache` |
| 2026-10-08 | Commits de la Fase 0 en rama `fase-0-preparacion`; `main` arranca solo con CLAUDE.md | Cumplir "una rama por fase" y que la fase pase por PR + CI |
| 2026-10-08 | Dependencias de UI: `react-resizable-panels` 4, `zustand` 5, `lucide-react` 1 | Las de la tabla del stack, en su versión estable actual |
| 2026-10-08 | Tokens como variables `--lt-*` en `:root` mapeadas con `@theme inline` | Permite cambiar el tema del editor en caliente sin regenerar CSS |
| 2026-10-08 | Router = estado `route` en Zustand, sin `react-router` | App de escritorio de una ventana: no necesita URLs ni historial; evita una dependencia |
| 2026-10-08 | Panel lateral cerrado = no se renderiza (no `collapsible` + `collapse()`) | La sincronización imperativa con el store fallaba al cambiar el modo de diseño; `useDefaultLayout` con `panelIds` guarda un layout por combinación |
| 2026-10-08 | Tamaños de paneles en `localStorage` (`libretex:<proyecto>:main/side`) | Simple y suficiente; se puede mover a `.libretex/` si hace falta compartirlo |
| 2026-10-08 | "PDF en ventana aparte" deshabilitado ("Próximamente") en Fase 1 | Necesita una segunda ventana Tauri; se hará con el visor real (Fase 6) |
| 2026-10-08 | tsconfig `lib` ES2023 | `Array.prototype.findLast`; WebKitGTK 2.52 lo soporta |
| 2026-10-08 | i18n propio (~80 líneas) en vez de i18next/react-i18next | Solo hace falta diccionario, interpolación y plurales; claves tipadas y sin dependencias. Test de paridad de claves y marcadores es/en |
| 2026-10-08 | Recompilar (+ indicador de errores/advertencias) en la barra superior; sin botón de descarga en el visor: Exportar → PDF / ZIP | Pedido del usuario: diferenciarse del layout de Overleaf. Compilar queda visible en todos los modos de diseño (antes desaparecía en «Solo editor») |
| 2026-10-08 | Paleta «Índigo» (acento `#6b5ce7`) en vez de la verde inicial | Elegida por el usuario para no parecer un clon de Overleaf; `#6b5ce7` en vez del `#7c6cf2` de la maqueta para que el texto blanco del botón llegue a 4,5:1 |
| 2026-10-08 | Atajos pedidos por el usuario: `Ctrl+Enter` compilar (Fase 5), `Ctrl+Shift+S` descargar PDF (Fase 10) | Hoy solo se muestran como etiquetas en menús y tooltips |
| 2026-10-08 | Fase 2 en orden paths → plantillas → comandos → homescreen | Los comandos dependen de la validación de rutas y de las plantillas |
| 2026-10-08 | Rutas del frontend: se rechaza cualquier `..` (no solo los que escapan) | Más simple de razonar; ningún flujo legítimo lo necesita |
| 2026-10-08 | Crates nuevos: `tauri-plugin-dialog` 2 (diálogos nativos desde Rust) y `tempfile` (solo tests) | Abrir carpeta / importar ZIP sin que el frontend envíe rutas arbitrarias; directorios temporales en tests |
| 2026-10-08 | `zip` sin features por defecto (solo `deflate`, `deflate64`) | Evita AES, bzip2, zstd (C), lzma; los ZIP de Overleaf usan deflate |
| 2026-10-08 | Plantillas como recursos de Tauri (`bundle.resources`) + `template.json` por plantilla | Sin crates de embebido; en dev se copian a `target/debug/templates`. Todas con XeLaTeX |
| 2026-10-08 | Nombre del proyecto = nombre de su carpeta; renombrar = renombrar la carpeta | Una sola fuente de verdad; coincide con lo que el usuario ve en el gestor de archivos |
| 2026-10-08 | Fechas como milisegundos Unix (`openedAt`, `modifiedAt`) | Sin crate de fechas en Rust; el frontend las formatea con `Intl` |
| 2026-10-08 | ZIP: se rechaza el archivo entero ante rutas absolutas, `..` que escapan o >2 GiB / >50 000 entradas; se ignoran symlinks y `__MACOSX`; se quita la carpeta raíz común | `enclosed_name` de zip 8 solo quita la raíz de rutas absolutas (en contra de su doc); preferimos rechazar ZIPs sospechosos |
| 2026-10-08 | Webview sin permisos de plugins (`core:default`); diálogos, «mostrar en gestor» y papelera desde comandos Rust | Capabilities mínimas: el frontend nunca maneja rutas arbitrarias |
| 2026-10-08 | Backend simulado en memoria (`lib/mockBackend.ts`) cuando la app no corre en Tauri | Permite la vista previa en el navegador y tests sin disco; mismo comportamiento que los comandos Rust |
| 2026-10-08 | Errores del backend: códigos → `errors.*` en i18n; dentro de diálogos se muestran en línea, el resto como avisos | El usuario ve un texto traducido; el mensaje técnico queda como detalle |
| 2026-10-08 | Papelera de la app = vista de la papelera del sistema filtrada por `trashed.json` (crate `trash`, `os_limited`) | Pedido del usuario; no duplicar papeleras. La fecha de borrado es la registrada por LibreTeX (sin la feature `chrono`, `trash` da fechas inválidas en Linux). `TrashBin` es un trait para testear con una papelera falsa |
| 2026-10-09 | Árbol oculta `.libretex/` y `.git/`; la raíz y `.libretex/` no se pueden renombrar, mover ni borrar; symlinks: solo se listan si apuntan dentro y nunca se siguen al operar | Seguridad y no romper los metadatos del proyecto |
| 2026-10-09 | Borrar archivos/carpetas = papelera del sistema (sin registro en la Papelera de la app, que es solo para proyectos) | Principio «nunca perder trabajo» sin complicar la Papelera |
| 2026-10-09 | Archivos de texto: UTF-8 (BOM se quita), máximo 20 MB en el editor | Los binarios (imágenes, PDF) van al visor, no al editor |
| 2026-10-09 | Watcher con `notify` 8 + debounce propio (sin `notify-debouncer-*`); un solo proyecto vigilado a la vez | Suficiente para un editor de una ventana; una dependencia menos |
| 2026-10-09 | Conflictos disco/buffer: cerrar el diálogo (Esc) = conservar mis cambios | Nunca perder trabajo por defecto |
| 2026-10-09 | Soltar archivos del sistema: Rust guarda las rutas del último evento nativo de *drop*; `import_dropped` solo acepta esas rutas (espera hasta 1 s por el orden de eventos) | El frontend nunca puede pedir copiar rutas arbitrarias del disco |
| 2026-10-09 | Protocolo de assets de Tauri con alcance vacío + `allow_directory` del proyecto al abrirlo | Visor de imágenes sin abrir el resto del disco a la webview |
| 2026-10-09 | Crear/renombrar con diálogos (no edición en línea en el árbol); borrar pide confirmación aunque vaya a la papelera | Más simple y accesible; principio de confirmar acciones destructivas |
| 2026-10-09 | Figuras PDF en el visor central: mensaje hasta la Fase 6 (pdf.js) | Evita cargar pdf.js dos veces antes de tener el visor real |
| 2026-10-09 | Lenguaje `codemirror-lang-latex` 0.6 (gramática Lezer de Overleaf) sin su linter ni tooltips | Mantenido y con árbol sintáctico real (esquema, matemáticas). El linter por archivo da falsos positivos en proyectos multiarchivo; los tooltips están solo en inglés |
| 2026-10-09 | Autocierre solo de `{ [ ( $` (también antes de `$`) | El autocierre por defecto del paquete incluye `'` y `"`, que estorban con ``comillas'' y apóstrofos |
| 2026-10-09 | Una `EditorView` y un `EditorState` por pestaña; autoguardado 1 s tras dejar de escribir, al cambiar de pestaña, al cerrarla y al salir del proyecto | Conserva deshacer/cursor por archivo; nunca perder trabajo |
| 2026-10-09 | Comandos del editor como funciones puras `EditorState → TransactionSpec`; negrita/cursiva/etc. alternan (aplicar dos veces quita) | Testeables sin DOM; comportamiento esperado de un editor |
| 2026-10-09 | Menús con acciones de fases futuras: deshabilitados con «Próximamente» en vez de no hacer nada | Evita botones muertos |
| 2026-10-09 | Índice de etiquetas/bibliografía en Rust (`regex`), recargado al abrir y con cada cambio de `.tex`/`.bib` del watcher (el autoguardado lo dispara) | Rápido en proyectos grandes; un solo camino de actualización |
| 2026-10-09 | Autocompletado propio con `override: [proyecto, latexCompletionSource]` y el del paquete desactivado | El paquete usa `override`, que oculta cualquier otra fuente |
| 2026-10-09 | Esquema por regex sobre el texto (no el árbol Lezer) e incluidos cargados como buffers sin pestaña | Funciona igual para archivos no abiertos en el editor; los buffers se mantienen al día con el watcher |
| 2026-10-09 | `goToLine(archivo, línea)` en el store como única vía para saltar en el editor | La reutilizarán los registros (Fase 5) y SyncTeX (Fase 6) |
| 2026-10-08 | Identidad git local del repo: `GASDJUGA` + correo noreply de GitHub | No había identidad git global; evita exponer el correo personal |
