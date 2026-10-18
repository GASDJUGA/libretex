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

Lo único que usa la red es el gestor de paquetes (descargas desde CTAN / TeX Live) y el
respaldo opcional en GitHub (5.9), siempre de forma explícita a petición del usuario.

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

**Fix obligatorio Wayland + NVIDIA:** el renderer DMA-BUF de WebKitGTK cierra la conexión con
Wayland («Error 71») por la sincronización explícita del driver de NVIDIA. En `main.rs`, en
Linux con Wayland y NVIDIA y solo si el usuario no definió las variables, establece
`__NV_DISABLE_EXPLICIT_SYNC=1` antes de construir la app: se conserva el dibujo por GPU.
`LIBRETEX_SAFE_RENDERER=1` vuelve a `WEBKIT_DISABLE_DMABUF_RENDERER=1` (sin aceleración).
En Rust edición 2024 `std::env::set_var` requiere bloque `unsafe`; documéntalo.

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
  `mainFile`, `compiler`, `shellEscape`, `spellLang`.
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
- **Revisión en vivo** (sin compilar): llaves, entornos y fórmulas sin cerrar o cruzados se
  marcan mientras se escribe (`src/lib/latexCheck/`); se puede desactivar.
- Imágenes (`png`, `jpg`, `pdf`) abiertas desde el árbol se muestran en un visor dentro del
  panel central.

**Panel derecho: PDF**
- Botón **Recompilar** con indicador de progreso y desplegable: compilador (pdfLaTeX /
  XeLaTeX / LuaLaTeX), modo borrador, detener en el primer error, limpiar archivos
  auxiliares. La compilación es **siempre manual** (pedido del usuario).
- Botón de registros con contador de errores/advertencias, botón de descarga del PDF.
- Visor con zoom, navegación por páginas y búsqueda (detalles en 5.4).

**General**
- Todos los divisores redimensionables; tamaños y paneles abiertos se recuerdan por proyecto.
- Tema por defecto como la referencia: interfaz oscura + editor claro. Alternativa: editor
  oscuro. Paleta propia **Índigo** (elegida por el usuario; tokens en `src/styles/index.css`):
  barra superior `#191b2a`, paneles `#242840`, texto `#e8e9f3`, acento violeta `#6b5ce7`,
  editor `#ffffff`. No imitar la paleta ni la disposición exacta de botones de Overleaf:
  Recompilar va en la barra superior y descargar el PDF está en Exportar.
- Atajos: `Ctrl+S` guardar (no compila), `Ctrl+Enter` compilar (lo usa el usuario a diario), `Ctrl+Shift+S` descargar el PDF
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
- Sin compilación automática: se compila con Recompilar o `Ctrl+Enter`. Los errores
  estructurales aparecen antes, al escribir, gracias a la revisión en vivo (5.2).
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

Instalar TeX antes de LibreTeX es opcional (pedido del usuario): sin TeX, la app ofrece su
propio TeX Live. Con el de LibreTeX y uno del sistema instalados, el usuario **elige cuál
usar** (pestaña Paquetes, panel del editor y Ajustes; `texDistribution` en `settings.json`):
el elegido es el que compila y el que gestiona los paquetes.

**Búsqueda**
- Por nombre y descripción, combinando la base de datos de TeX Live (`tlmgr search`,
  `tlmgr info --json`; revisa las opciones exactas con `tlmgr help`) con la API JSON de CTAN
  (`https://ctan.org/json/2.0/packages`, `https://ctan.org/json/2.0/pkg/<nombre>`).
- El índice de CTAN se cachea en `~/.cache/libretex/ctan/` para poder buscar sin conexión;
  botón para actualizarlo.
- Ojo: el nombre en CTAN, el nombre en TeX Live y el archivo `.sty` no siempre coinciden;
  resuelve el mapeo (por ejemplo con `tlmgr search --global --file /x.sty`).

**Paquetes instalados** (pedido del usuario): junto a «Buscar paquetes», un botón
«Paquetes instalados» lista los del TeX en uso, por nombre, con filtro y la misma ficha.

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

Fuente y tamaño del editor, tema del editor, keymap (normal / Vim / Emacs), sangría
automática, revisión en vivo on/off, compilador por defecto, idioma de la UI, diccionario,
directorio de proyectos, ruta de la distribución TeX, preview matemático on/off, preview al
pasar el mouse.

### 5.9 Respaldo con Git y GitHub

Pedido del usuario: respaldar los proyectos con Git y, si quiere, en GitHub. Es distinto del
historial local (5.7): aquel es automático y vive en `.libretex/history.git`; el respaldo es
el repositorio Git **normal del proyecto** (`<proyecto>/.git`), visible y usable con otras
herramientas, y nunca se activa solo.

- **Activar** (por proyecto, con confirmación): `git init` si no hay repositorio (si ya lo hay,
  se usa tal cual), `.gitignore` de LaTeX (`.libretex/`, auxiliares de compilación, PDF de
  build). Identidad del autor: la de `git config` si existe; si no, se pide una vez, sugiriendo
  el correo *noreply* de GitHub para no exponer el personal.
- **Respaldar:** lista de cambios desde el último respaldo y un commit con mensaje (por
  defecto, fecha y hora). Lista de respaldos anteriores; restaurar un archivo o el proyecto
  desde uno de ellos (con confirmación; lo actual queda como respaldo antes de restaurar).
- **GitHub (opcional):** conectar con un repositorio **privado** nuevo, creado con `gh repo
  create --private` si `gh` está instalado y autenticado, o con la URL de uno existente.
  **Subir** (push) y **Traer cambios** (pull solo *fast-forward*; si hay divergencia se explica
  y no se mezcla nada automáticamente), con progreso y errores claros. Se puede activar
  «subir después de cada respaldo».
- **Seguridad:** LibreTeX no guarda tokens ni contraseñas: la autenticación es la del sistema
  (`gh auth setup-git` / el *credential helper* de git). Las URLs de remotos se validan (solo
  `https://` y `git@`), los comandos se ejecutan sin shell y con argumentos fijos, y la red
  solo se usa al pulsar Subir/Traer/Conectar.

### Fuera de alcance en v1
Modo Visual (WYSIWYG), colaboración en tiempo real, sincronización en la nube, MiKTeX,
Windows/macOS y otras distribuciones de Linux (el código no debe impedirlos, pero solo se
prueba en Arch; ver «Después de v1» al final del plan).

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
- [x] Detección de la distribución TeX y de los motores disponibles.
- [x] Ejecución de `latexmk` con streaming de salida, cancelación y cola.
- [x] Parser de logs con fixtures reales (pdfLaTeX, XeLaTeX con babel, errores de llaves,
      `.sty` faltante, referencias indefinidas, overfull boxes).
- [x] Panel de registros, contador en el botón, diagnósticos en el editor, navegación.
- [x] Botón Recompilar con su desplegable; atajo `Ctrl+Enter` para compilar desde
      cualquier parte de la vista de proyecto. (La compilación automática se quitó a pedido
      del usuario; en su lugar, revisión en vivo sin compilar.)
- **Aceptación:** un error introducido a propósito aparece marcado en la línea correcta.

### Fase 6 — Visor PDF y SyncTeX
- [x] Visor pdf.js perezoso, zoom, búsqueda, modo oscuro opcional (reemplaza el panel
      provisional con «Abrir PDF» / «Mostrar en la carpeta»).
- [x] Conservar posición y zoom entre recompilaciones.
- [x] SyncTeX directo e inverso, con parseo testeado en Rust.
- **Aceptación:** doble clic en un párrafo del PDF lleva a su línea y viceversa.

### Fase 7 — Preview de matemáticas
- [x] Detector de regiones matemáticas con tests (casos de 5.5).
- [x] Extracción de macros del preámbulo con tests (incluye `\ihat` y `\jhat`).
- [x] Tooltip con MathJax SVG empaquetado localmente, extensiones listadas, errores en rojo.
- [x] Soporte de entornos con alineación, opción de hover y ajuste on/off.
- **Aceptación:** al escribir dentro de `align*` usando `\ihat`, el preview se actualiza en
      vivo y se ve correcto, sin conexión a internet.

### Fase 8 — Gestor de paquetes
- [x] Detección de backends (5.6) y visualización del activo.
- [x] Asistente de instalación del TeX Live gestionado por LibreTeX (con progreso y
      posibilidad de cancelar).
- [x] Índice CTAN cacheado + búsqueda combinada + mapeo CTAN ↔ TeX Live ↔ `.sty`.
- [x] Fichas de paquete con instalar / desinstalar / actualizar / documentación / agregar al
      preámbulo.
- [x] Modo solo lectura para el TeX Live de pacman.
- [x] Integración "`.sty` faltante → instalar → recompilar".
- **Aceptación:** con el backend gestionado, instalar un paquete no presente y compilar un
      documento que lo usa funciona de punta a punta.

### Fase 9 — Productividad
- [x] Búsqueda y reemplazo en todo el proyecto (`Ctrl+Shift+F`, crate `ignore` + `regex`).
- [x] Revisión ortográfica es/en con diccionario personal.
- [x] Pantalla de Ajustes completa (5.8), keymaps Vim/Emacs.
- [x] Varios proyectos abiertos a la vez en pestañas, como un navegador (pedido del usuario):
      Inicio + una pestaña por proyecto, cada una conserva su estado.
- **Aceptación:** los ajustes persisten entre reinicios y se aplican en vivo.

### Fase 10 — Historial y exportación
- [x] Historial con git dir separado, instantáneas automáticas y manuales.
- [x] Panel con lista, diff y restauración.
- [x] Exportar PDF y ZIP; atajo `Ctrl+Shift+S` para descargar el PDF compilado.
- **Aceptación:** restaurar una versión anterior recupera exactamente el contenido.

### Fase 11 — Respaldo con Git y GitHub (5.9)
- [x] Activar Git en un proyecto (o usar el repositorio existente), `.gitignore` de LaTeX e
      identidad del autor (sugerencia de correo *noreply*).
- [x] Panel «Respaldo»: cambios sin respaldar, respaldar con mensaje, lista de respaldos y
      restauración de un archivo o del proyecto.
- [x] Conectar con GitHub (repo privado nuevo con `gh` o URL existente), subir y traer
      cambios (*fast-forward*), con progreso y errores; opción «subir tras cada respaldo».
- [x] Importar desde GitHub (pedido del usuario): en Inicio, «Desde GitHub» lista los
      repositorios de la cuenta (`gh repo list`), marca los que ya están en LibreTeX y clona el
      elegido (o una URL) en la carpeta de proyectos, con el respaldo ya conectado.
- **Aceptación:** un proyecto nuevo se respalda, se sube a un repositorio privado de GitHub y,
      tras un cambio hecho en otro clon, «Traer cambios» lo trae al editor.

### Fase 12 — Pulido y distribución
- [x] Revisión de accesibilidad básica (foco, atajos, contraste) y rendimiento.
- [x] Autocompletado de los comandos personalizados del usuario (`\newcommand` del preámbulo
      y de los incluidos; reutilizar `lib/macros/extract.ts`), pedido al probar la Fase 7.
      (Adelantado a pedido del usuario durante la Fase 8.)
- [x] Autocompletado más rápido: que la lista aparezca antes al escribir (pedido del usuario al
      probar la Fase 9; medir dónde se va el tiempo: fuentes, `interactionDelay`, filtrado).
- [x] Autocompletado de comandos de paquetes cargados (`\ket`, `\braket` de physics…), `\begin`
      solo primero en matemáticas y memoria de los comandos más elegidos por proyecto (pedidos
      del usuario al probar la Fase 12).
- [ ] Pegar: el cursor queda al inicio de lo pegado en vez de al final (pedido del usuario).
- [ ] Zoom out muy rápido del PDF: la vista puede saltar a otra página (pedido del usuario).
- [ ] Zoom del PDF: quitar el parpadeo residual que a veces queda en WebKitGTK entre zooms
      (pedido del usuario al cerrar la Fase 6; hoy «casi no se nota, aceptable»).
- [x] Capturas en `docs/screenshots/` y README final.
- [x] `pnpm tauri build` (AppImage) y un `PKGBUILD` para Arch.
- [ ] `gh release create v1.0.0` con los artefactos.
- **Aceptación:** la app instalada desde el PKGBUILD funciona fuera del entorno de desarrollo.


### Después de v1 — LibreTeX multiplataforma (proyecto aparte)

No son fases de este plan: v1 termina en la Fase 12 y solo se prueba en Arch. Esto es la
hoja de ruta para llevar LibreTeX a otras distribuciones de Linux y a Windows en un proyecto
posterior. Mientras tanto, el código de v1 no debe cerrarle el paso (ver «Reglas desde ya»).

**A. Otras distribuciones de Linux (Ubuntu/Debian, Fedora, openSUSE)**
- Paquetes: `.deb` y `.rpm` con los *bundle targets* de Tauri, además del AppImage; publicarlos
  en los releases de GitHub. Más adelante: PPA (Ubuntu), COPR (Fedora) y Flathub.
- Flatpak: el *sandbox* no ve la TeX Live del sistema. Hay que elegir entre
  `flatpak-spawn --host` (permiso amplio) o usar solo el TeX Live gestionado por LibreTeX
  dentro del sandbox. Decidirlo antes de empezar.
- Dependencias de WebKitGTK 4.1 según la distro (`libwebkit2gtk-4.1-0` en Debian/Ubuntu
  ≥ 22.04, `webkit2gtk4.1` en Fedora); verificar el fix de Wayland + NVIDIA en GNOME.
- TeX de la distribución: generalizar el backend «solo lectura» de pacman (5.6) a
  `dpkg -S`/`apt-file` y `rpm -qf`/`dnf provides` para sugerir el paquete que falta, y el
  aviso de instalación con los comandos de `apt`/`dnf`/`zypper`.
- CI: matriz con Ubuntu y un contenedor Fedora (tests de detección de TeX y empaquetado).

**B. Windows**
- Webview: WebView2 (en vez de WebKitGTK); instalador MSI/NSIS con Tauri; firma de código
  opcional (SmartScreen).
- Distribuciones TeX: **MiKTeX** (la más común; nuevo backend con su gestor de paquetes
  y la instalación «al vuelo») y TeX Live para Windows (`tlmgr` normalmente escribible).
  `latexmk` necesita Perl con MiKTeX: detectarlo y explicarlo.
- Procesos: `killpg` (crate `libc`) es solo Unix. Para cancelar todo el árbol hace falta un
  *Job Object* (crate `windows-sys`) o `taskkill /T`.
- Rutas: separador `\`, letras de unidad, mayúsculas/minúsculas indistintas, prefijo
  `\\?\` de `canonicalize` (crate `dunce`), nombres reservados (`CON`, `NUL`…) y caracteres
  prohibidos (`<>:"|?*`) en `validate_name`. Los tests de path traversal, también en Windows.
- Texto: finales de línea CRLF en el editor, el parser de logs y el índice del proyecto.
- Papelera: la Papelera de reciclaje vía crate `trash` (su `os_limited` cubre Windows).
  Rutas de datos: `directories` ya da `%APPDATA%`. El TeX Live gestionado usa
  `install-tl-windows`.
- CI: job `windows-latest` con `pnpm test` y `cargo test`.

**C. macOS:** posible con la misma base (WebKit del sistema, MacTeX), pero no prioritario.
Ojo: `trash::os_limited` no existe en macOS, así que la Papelera de la app necesita otro camino.

**Reglas desde ya (en v1):** el código específico de una plataforma va detrás de
`#[cfg(...)]` y, cuando crezca, en `src-tauri/src/platform/`. Rutas con `Path`/`PathBuf`
(sin concatenar `/` en Rust). Nada de comandos de shell. Cualquier supuesto de Arch (por
ejemplo `/usr/bin/vendor_perl` o los grupos de pacman) se documenta como tal.

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

- Fase en curso: **12 — Pulido y distribución** (rama `fase-12-pulido`). Fases 0–11 cerradas
  (tags `v0.0.0` … `v0.11.0`). Repo privado https://github.com/GASDJUGA/libretex
- Último hito: autocompletado (pedidos del usuario tras probar la fase).
  - Comandos de paquetes: `editor/packageCommands.ts`, tabla de ~30 paquetes (physics,
    braket, mathtools, siunitx, cancel, biblatex, tikz…) con la forma de sus argumentos
    (`\braket{}{}` → un campo por par); `packageCommandSource` los ofrece solo si el
    documento carga el paquete (`lib/macros/extract.ts`: `extractPackages`/`collectPackages`
    sobre `preamblePieces`, el recorrido del preámbulo que ahora comparte con las macros;
    `usePreamble` da macros y paquetes al editor), sin repetir los que ya trae la gramática;
    +2 como los comandos del usuario (`\ket` antes que `\ker`).
  - `\begin` en matemáticas: `\begin`/`\end` solos primero (antes, los atajos
    `\begin{align}`… ganaban por ser de matemáticas); dentro de `\begin{…}` en una fórmula,
    primero los entornos que valen ahí (`MATH_ENVIRONMENTS`: aligned, cases, pmatrix…).
  - Memoria: `editor/completionUsage.ts`, cada opción elegida suma en su proyecto
    (`localStorage`, como la sesión; 300 más usados); +8 con un uso, +14 con dos… hasta +30
    (no supera el ±50 de matemáticas ni el +100 de escribir el nombre completo). Se cuenta al
    aplicar la opción (`withUsageBoost` envuelve el `apply`; las de la gramática no marcan la
    transacción).
- Antes: empaquetado. `pnpm tauri build` → `LibreTeX_<versión>_amd64.AppImage`
  (113 MiB con WebKitGTK; targets solo `appimage`). `packaging/arch/PKGBUILD`: clona el tag
  `v<pkgver>` del propio checkout (`git+file://`, el repo de GitHub es privado), compila el
  `.deb` de Tauri y extrae su contenido (binario, `.desktop`, íconos, plantillas en
  `/usr/lib/LibreTeX`, que es donde Tauri busca los recursos); `--remap-path-prefix`.
  Probado: `makepkg -f --nodeps` desde la rama (sin instalar) y el binario del paquete
  extraído y el AppImage en Xvfb con HOME vacío: abren el inicio con el backend real. Falta
  que el usuario lo instale (`sudo pacman -U`). De paso: Content-Security-Policy estricta en
  la webview (antes `null`), probada con el build de producción en WebKitGTK sin
  violaciones (MathJax, PDF con worker/wasm, ortografía). Ojo al probar en Xvfb: hace falta
  `GDK_BACKEND=x11`; sin eso GTK abre las ventanas en la sesión Wayland del usuario.
- Antes: capturas y README. `scripts/screenshots.py` saca las capturas con WebKitGTK
  (el motor de la app) en Xvfb a 1440×900 sobre la vista previa con datos de ejemplo (sin
  archivos personales): inicio, proyecto (vista previa de `\ihat` y PDF), paquetes,
  historial con diff y respaldo conectado a GitHub. README: qué hace por áreas, requisitos
  de uso (webkit2gtk, git, gh opcional) separados de los de desarrollo, TeX opcional,
  atajos principales.
- Antes: autocompletado más rápido. Medido en la vista previa: la lista tardaba ~105 ms
  en aparecer y otros ~105 ms en seguir cada letra; las fuentes son síncronas y cuestan
  ~2 ms: el tiempo era el `activateOnTypingDelay` de CodeMirror (100 ms sin escribir antes
  de consultar, también en cada letra). Con 15 ms (`COMPLETION_TYPING_DELAY_MS` en
  `editor/mathTab.ts`): aparece en ~17 ms y sigue cada letra en ~17 ms. Test que falla con el
  retardo anterior.
- Antes: accesibilidad y rendimiento.
  - Contraste: auditoría de los tokens (WCAG AA 4,5:1); se aclararon `fg-muted` (#aab0cc),
    `danger` (#f78c95), `success`, `info`, comentarios y números de línea de ambos temas del
    editor; nuevo `--lt-accent-text` (#a99cff) para el violeta como texto/ícono sobre el cromo
    oscuro (el acento #6b5ce7 queda solo como fondo de botones); el borde de foco del buscador
    del editor usa el color de comandos del tema. `test/tokens.test.ts` comprueba 52 pares.
  - axe-core (`test/a11y.test.tsx`, dependencia de desarrollo) recorre inicio, Papelera,
    Paquetes, Ajustes, la vista de proyecto con cada panel, el historial y el diálogo de
    atajos. Encontró y se arregló: el editor sin nombre (ahora «Editor: main.tex»), botones de
    cerrar anidados dentro de las pestañas (ahora la cruz es solo para el mouse y Supr cierra
    la pestaña; ←/→/Inicio/Fin recorren las pestañas, `lib/tabKeys.ts`) y `role="dialog"`
    sobre un `<form>`.
  - Foco: los diálogos atrapan Tab/Mayús+Tab y devuelven el foco a quien los abrió; los menús
    aceptan Inicio/Fin y se cierran con Tab.
  - Ayuda: «Atajos de teclado» (F1, menú Ayuda y botón del riel; lista única
    `lib/shortcutList.ts`), «Acerca de LibreTeX» (versión de `package.json` vía
    `__APP_VERSION__`, también en el pie del inicio) y «Documentación de LaTeX» (comando Rust
    `open_help_link` con URLs fijas del wikibook es/en; la webview no manda URLs).
  - Menú del proyecto: «Renombrar…» funciona (guarda antes y vuelve a vigilar la carpeta
    nueva), «Mostrar en el gestor de archivos», y el archivo principal se elige entre los
    `.tex` del proyecto. Se quitó «Ajustes del proyecto» (sin contenido propio).
  - Rendimiento medido en la vista previa con un documento de 6061 líneas: 2,4 ms por tecla
    (máx. 3,2 con layout), 2,7 ms dentro de `align*` con la vista previa de MathJax, ninguna
    tarea larga (> 50 ms) en el trabajo diferido (revisión en vivo, esquema, autoguardado).
  - Pendiente visible: «PDF en ventana aparte» sigue «Próximamente».
- Fase 11 cerrada: aprobada por el usuario (probó subir/traer con GitHub real), PR #12
  fusionado con CI verde, tag `v0.11.0`.
- Último hito: importar desde GitHub (para seguir en otra máquina). Rust: `remote::repo_key`
  (la misma dirección en sus formas https/git@/ssh, sin `.git` ni mayúsculas),
  `github_repos` (`gh repo list --limit 300 --json …`, más recientes primero), `clone` (`git
  clone --progress -- <url> <destino>`; nunca en una carpeta que exista; si falla no deja
  nada), `Ctx::new_project_folder` (nombre del repositorio, « (2)» si está ocupado). Comandos
  `github_repos` (cada repo con el proyecto de LibreTeX que ya respalda ahí, por el `origin` de
  los proyectos registrados) y `clone_project` (rechaza un repositorio que ya está; progreso
  `backup-progress` con `clone`; cancelable con `backup_cancel("clone")`; luego `open_folder`).
  `pending` ignora `.libretex/` aunque el `.gitignore` no lo diga (el clon crea
  `project.json`). Frontend: botón «Desde GitHub» en Proyectos, `CloneDialog` (lista con filtro,
  privados con candado, los que ya están con «Abrir», o una dirección; barra de progreso y
  Cancelar); al terminar se abre como cualquier importación (pregunta el archivo principal si
  hay varios). Probado: Rust con `git` real (primera máquina sube, segunda clona: respaldo
  conectado y al día), vitest y la vista previa; los campos de `gh repo list` comprobados con
  el `gh` de esta máquina.
- Antes: GitHub. Rust `backup/remote.rs`: `clean_url` (solo `https://host/ruta` sin
  usuario ni token, o `git@host:ruta`; nada que git lea como opción o ruta local),
  `create_github_repo` (`gh repo create <nombre> --private --source <proyecto> --remote origin`,
  sin subir), `connect_url`, `push` (`git push --progress -u origin -- <rama>`), `fetch` y
  `fast_forward` (cuenta adelante/atrás con git2: si ambos lados tienen respaldos nuevos,
  error `diverged` sin tocar nada; si no, `git merge --ff-only`, que se niega a pisar cambios
  sin respaldar → `localChanges`; devuelve los archivos cambiados para recargarlos). Errores
  de git/gh clasificados (`notSignedIn` con `gh auth login`/`gh auth setup-git`, `network`,
  `remoteNotFound`). `tex/process.rs`: `spawn_progress` corta también en `\r`, así el
  progreso de git («Writing objects: 45%») llega en vivo (evento `backup-progress`); cancelar
  mata el grupo de procesos; una operación de red por proyecto; 15 min máximo. Comandos
  `backup_tools`, `backup_set_push` (`backupPush` en `project.json`), `backup_connect_url`,
  `backup_create_github`, `backup_push`, `backup_pull`, `backup_cancel`. Frontend:
  `GitHubSection` (conectar, dirección corta, «N respaldos sin subir / por traer», Subir,
  Traer cambios, barra de progreso con la etapa en palabras, Cancelar, «Subir después de
  cada respaldo», error con detalles), `ConnectDialog` (repo nuevo con nombre sugerido sin
  tildes ni espacios —`lib/remote.ts`— o URL existente). Probado en Rust con `git` real y un
  repositorio desnudo local como remoto: subir, traer un cambio hecho en otro clon,
  divergencia (no se mezcla nada) y cambios sin respaldar protegidos; en vitest con el
  remoto simulado (la aceptación: crear, subir, traer al editor un cambio de otro clon) y en
  la vista previa. Falta la prueba con GitHub de verdad (crea un repositorio en la cuenta del
  usuario: la hace él).
- Antes: panel «Respaldo». Rust `backup/mod.rs`: `pending` (estado de git2 con los
  nuevos, modificados y borrados; los de más de 50 MB aparte, con aviso), `backup` (commit de
  todo con el autor; sin cambios no hay respaldo vacío; repone las líneas del `.gitignore`),
  `list` (commits de la rama con autor y si ya están en la rama remota), `changes`, `file_at`,
  `restore_file`/`restore_project` (antes, un respaldo «Antes de restaurar …» si había cambios;
  no se reescribe el repositorio: lo restaurado queda como cambio para el próximo respaldo).
  Comandos `backup_pending`, `backup_create`, `backup_list`, `backup_changes`, `backup_file`,
  `backup_restore_file`, `backup_restore`. Frontend: en el panel, cambios sin respaldar (clic
  abre el archivo), mensaje con «Respaldo del <fecha>» por defecto, «Respaldar» (guarda antes
  los búferes) y los últimos 5 respaldos; el panel se relee tras guardar, operar en el árbol o
  cambios externos. Ver/restaurar un respaldo reutiliza `HistoryPane` con
  `historySource: "backup"` (`store/history.ts` con dos fuentes; textos propios; ícono de
  subido/no subido). Test con el `git` del sistema: tras respaldar, `git status` limpio y
  `git log` con el mensaje y el autor.
- Antes: activar el respaldo con Git. Rust: `gitops.rs` (lo común del historial y el
  respaldo: registrar el disco —sin `.libretex/` aunque el `.gitignore` no lo diga, ni archivos
  de más de 50 MB—, cambios de un commit, archivo como era, restaurar archivo/árbol; el
  historial ya lo usa) y `backup/mod.rs`: solo el `.git` propio del proyecto (nunca el de una
  carpeta superior: se avisa `insideOtherRepo`), `enable` (`git init` en `main` o el
  repositorio existente tal cual, `.gitignore` de LaTeX completado sin repetir líneas, autor en
  la config local si `git config` no tiene), `status` (rama, autor y su origen, `origin`,
  adelante/atrás según lo último traído, cambios pendientes, `backupPush`). Autor pedido una
  vez: `gitName`/`gitEmail` en `settings.json`; «Usar mi cuenta de GitHub» pregunta a `gh api
  user` (red, solo al pulsarlo) y arma el correo `<id>+<login>@users.noreply.github.com`.
  `backup/remote.rs`: programas sin shell, sin preguntas (`GIT_TERMINAL_PROMPT=0`, ssh
  `BatchMode`), con tiempo máximo. Frontend: riel «Respaldo con Git» (`BackupPanel`),
  `EnableBackupDialog`, `store/backup.ts`, backend simulado `lib/mockBackup.ts`. Probado en la
  vista previa y con tests (Rust: repositorio padre, existente, `.gitignore`, autor).
- Fase 10 cerrada: aprobada por el usuario, PR #11 fusionado con CI verde, tag `v0.10.0`.
- Antes (Fase 10): exportar. Rust `projects/export.rs`: `sources` (todo lo del usuario, también
  dotfiles como `.latexmkrc` y lo que su `.gitignore` ignore; sin `.libretex/`, `.git/` ni lo que
  genera LaTeX), `zip_sources` (deflate, escritura atómica junto al destino; test de ida y
  vuelta con el importador) y `copy_pdf`. Comandos `export_pdf` y `export_zip` con diálogo
  nativo «Guardar como» desde Rust (nombre del proyecto por defecto; no deja guardar el ZIP
  dentro del propio proyecto). Frontend: `lib/export.ts`, menú Exportar y Archivo, y
  `Ctrl+Shift+S` (sin PDF: «compila con Ctrl+Enter»); el ZIP guarda antes los búferes.
- Antes: historial local. Rust `history/mod.rs` (`git2` 0.21 sin red, libgit2
  empaquetado): repositorio desnudo en `.libretex/history.git` con el proyecto como work tree
  (`set_workdir`), sin tocar el `.git` del usuario; `info/exclude` propio (`.libretex/`,
  `.git/`, auxiliares de LaTeX), respeta el `.gitignore` del proyecto, omite archivos de más de
  50 MB y registra los borrados. Versiones = commits con firma local «LibreTeX» y el tipo en
  una línea final (`LibreTeX-Kind: manual|auto|compile`); las automáticas solo si el árbol
  cambió. Comandos `history_snapshot` (manual con nombre o auto) y `history_list`; tras cada
  compilación correcta, versión `compile` desde Rust (también en pestañas en segundo plano).
  Un candado global serializa el acceso. Frontend: `store/history.ts`, Archivo → «Guardar
  versión…» (diálogo con nombre; guarda los búferes antes), versión automática de todas las
  pestañas abiertas cada N minutos (Ajustes → Historial, 10 por defecto, 0 = desactivada).
- Antes: panel de historial (botón Historial de la barra; reemplaza al editor). Rust:
  `history::changes`, `file_at`, `restore_file` y `restore_project` (antes se guarda una
  versión «Antes de restaurar …»; lo agregado después va a la papelera). Frontend:
  `HistoryPane`, `DiffView` (`@codemirror/merge`). Aceptación probada en Rust
  (`restaurar_el_proyecto_recupera_exactamente_el_contenido`) y en la vista previa.
- Fase 9 cerrada: aprobada por el usuario tras sus pruebas, PR #10 fusionado con CI verde,
  tag `v0.9.0`.
- Último pedido de la fase (hecho): varios proyectos abiertos en pestañas, como Chrome (el
  usuario eligió pestañas en una ventana, no ventanas separadas). `store/workspaces.ts`: los
  stores por proyecto (vista, búferes, compilación, árbol, índice, búsqueda) tienen el
  proyecto en pantalla; al cambiar de pestaña se guarda una instantánea del que se va y se
  restaura la del que vuelve (lo que cambió en disco mientras tanto se reconcilia). El
  historial de deshacer de cada archivo se guarda como JSON (`editor/stateCache.ts`,
  `historyField`) y se recrea con extensiones nuevas. Una compilación en segundo plano sigue y
  su resultado entra en su instantánea (`applyCompileEvent`, función pura); la pestaña muestra
  un indicador. `store/loadedProject.ts`: lo asíncrono (guardar, árbol, índice, buscar,
  compilar) comprueba al terminar que su proyecto sigue en los stores. `TabStrip`: Inicio +
  proyectos, cerrar (cruz o clic central; guarda antes), arrastrar para reordenar, Ctrl+Tab /
  Ctrl+Mayús+Tab y Ctrl+RePág/AvPág; las pestañas se recuerdan entre sesiones; un proyecto
  quitado de la lista o que ya no existe pierde su pestaña. Probado en la vista previa y con
  tests (cambios, deshacer, cerrar, Ctrl+Tab, compilación en segundo plano, guardado tardío).
- Tras probar la fase, el usuario pidió (sin pasar de fase): (1) en matemáticas, priorizar los
  comandos de matemáticas (`\par`/`\part` salían antes que `\partial`). Hecho en
  `editor/latexCompletion.ts` con `mathOnlyCommands`/`symbolIndex`/`commandIndex` del paquete:
  dentro de matemáticas +50 a los de matemáticas y −60 a los de texto (la coincidencia completa
  vale 100 más); los comandos del usuario también suben. De paso, `mathRegionInState` mira el
  párrafo con el escáner si el árbol no ve matemáticas (la gramática perdía `$\part$`).
  (2) La velocidad del autocompletado queda para el pulido (Fase 12). (3) La barra de búsqueda
  del editor (Ctrl+F) se veía «por defecto»: ahora es propia (`EditorSearchBar` +
  `editorSearchPanel`, React en un panel de CodeMirror): mismas opciones e íconos que la
  búsqueda del proyecto, contador «4 de 5», anterior/siguiente, fila de reemplazo plegable,
  colores del tema del editor; búsqueda literal (`\nabla` no es un salto de línea).
- Antes: Ajustes completos (5.8). Rust `settings.rs`: `settings.json` leído campo por
  campo (lo que falta o no vale toma su valor por defecto; un archivo editado a mano nunca
  impide arrancar), claves desconocidas conservadas, escritura atómica con candado; comandos
  `get_settings`, `update_settings` (solo claves editables, cada valor validado: idioma,
  fuente sin caracteres de CSS, tamaño 8–32, enums), `choose_projects_dir` (diálogo nativo:
  el frontend nunca manda la ruta) y `monospace_fonts` (`fc-list :spacing=mono`). `Ctx` pasó a
  un `RwLock` y se actualiza en vivo (carpeta de proyectos, compilador e idioma de ortografía
  de los proyectos nuevos). Frontend: `store/settings.ts` carga de `settings.json` al iniciar,
  cambios optimistas (si el backend rechaza, aviso y se relee) y migra una vez lo que antes
  estaba en `localStorage`; `lib/appearance.ts` (tema oscuro del editor y fuente como CSS en
  `:root`), `editor/keymaps.ts` (Vim con línea de modo / Emacs de `@replit`, cargados bajo
  demanda en un `Compartment`; Ctrl+S/B/I/Enter/J siguen); pantalla con Interfaz, Editor,
  Ortografía (idioma de proyectos nuevos + diccionario personal), Visor PDF, Compilación,
  Distribución TeX y Rutas. Probado en la vista previa (tema oscuro, DejaVu Sans Mono y Vim al
  instante) y con tests de reinicio (el store vuelve a leer lo guardado; en Rust, `load` tras
  `update`).
- Último hito: revisión ortográfica. `lib/spell/words.ts` (palabras de la prosa: sin comandos,
  matemáticas —`mathRegions`—, comentarios, `\verb`/verbatim/tikz, argumentos opcionales ni los
  de `\ref`/`\cite`/`\usepackage`/`\begin`/`\includegraphics`…; `\href`/`\textcolor` solo
  saltan el primero; sin siglas, nombres con mayúsculas internas ni trozos de `\'e`),
  `lib/spell/speller.ts` (nspell + sugerencias ordenadas por distancia de tecleo: transponer o
  cambiar una tilde cuesta menos), `spell.worker.ts` + `checker.ts` (un worker por idioma con el
  diccionario empaquetado, respuestas en caché por palabra), `editor/spellcheck.ts` (subrayado
  ondulado 300 ms después de escribir; la palabra que se está escribiendo no se marca; clic
  derecho → `SpellMenu`: sugerencias y «Agregar al diccionario»). Idioma por proyecto
  (`spellLang` es/en/off en `project.json`, menú Ver; `update_project_meta` acepta compilador
  y/o idioma). Diccionario personal en `~/.config/libretex/dictionary.txt` (`spell.rs`, comandos
  `personal_dictionary`/`add_to_dictionary`/`remove_from_dictionary`; se ve y se quita en
  Ajustes) y vale para ambos idiomas. Probado: vista previa (subrayado, sugerencias,
  agregar, cambiar a inglés) y WebKitGTK real en desarrollo y con la build (worker IIFE, el
  `.aff` inglés va como `data:`): ~0,7 s hasta las primeras marcas. Siguiente: pantalla de
  Ajustes completa con keymaps Vim/Emacs.
- Antes: búsqueda y reemplazo en todo el proyecto. Rust: `files/search.rs` (recorre con
  `ignore`: sin carpetas ocultas —`.libretex/`, `.git/`—, respeta el `.gitignore` aunque no haya
  repositorio, sin auxiliares de LaTeX, binarios ni archivos > 20 MB; texto o expresión regular
  con `regex`, mayúsculas, palabra completa con medios límites —también `\frac`—; líneas y
  columnas UTF-16 como el editor; contexto corto; máx. 5000 resultados) y comandos
  `search_project`/`replace_in_project` (rutas validadas como al abrir, escritura atómica, `$1`
  solo con expresión regular). Frontend: `store/search.ts` (guarda los búferes antes, búsqueda
  con pausa de 250 ms, descarta respuestas viejas), `components/search/SearchPanel.tsx` (panel
  lateral, opciones, resultados por archivo plegables, clic selecciona la coincidencia con
  `goToRange`, «Reemplazar todo» y por archivo con confirmación), `Ctrl+Shift+F` (con la
  selección del editor) y menú Editar. Al recargar un archivo cambiado fuera del editor se
  aplican solo las diferencias (`diff` de `@codemirror/merge`): no salta el scroll, el cursor
  sigue en su texto y se puede deshacer. Backend simulado con la misma lógica en JS
  (`lib/projectSearch.ts`, mismos casos de test). Probado en la vista previa: buscar `\vec`, clic
  en un resultado, reemplazar todo.
- Fase 8 cerrada: aprobada por el usuario tras sus pruebas, PR #9 fusionado con CI verde,
  tag `v0.8.0`.
- Al empezar la Fase 9 pidió (sin pasar de ítem): (1) que `e^{` dentro de `\frac{}{}` cierre
  la llave. Causa, reproducida en WebKitGTK con su distribución latam: `^` es tecla muerta
  (AltGr+{) y `^` + `{` llega como una sola composición «^{», que `closeBrackets` ignora; en
  matemáticas además `^2` llegaba como «²» y `^a` como «â». Hecho: `editor/brackets.ts`
  (`deadKeyInput`: cierra el corchete final de un texto compuesto y, en matemáticas, convierte
  lo compuesto por `^` en `^x`). (2) Recordar dónde quedó en la sesión anterior (página del PDF
  y posición en cada archivo). Hecho: `lib/session.ts` (por proyecto en `localStorage`,
  escrito 400 ms después del último cambio: pestañas abiertas y activa, diseño y panel
  lateral, cursor y primera línea visible de cada archivo —los 100 más recientes, siguen a
  renombres—, lugar y zoom del PDF). Al abrir el proyecto se reabren las pestañas que siguen
  existiendo; cada archivo vuelve a su cursor y su scroll (también al cerrar y reabrir una
  pestaña); el PDF se abre en su lugar. Probado en la vista previa recargando la página.
- Tras probar la fase, el usuario pidió (sin pasar de fase) que instalar TeX antes sea
  opcional y poder elegir en la app entre el TeX del sistema y el de LibreTeX. Hecho:
  `TexChoice` (`auto`/`libretex`/`system`, `texDistribution` en `settings.json`, comando
  `set_tex_distribution`); el activo decide el PATH de compilación (`backends::tex_path`: el
  TeX Live de LibreTeX solo entra si es el activo) y el gestor de paquetes. Selector
  `DistributionPicker` en Paquetes, panel del editor y Ajustes (solo si hay los dos); el aviso
  de «falta TeX» ofrece abrir Paquetes; README: TeX opcional, dos caminos. Arreglado de paso:
  con el TeX Live de LibreTeX instalado el de pacman dejaba de detectarse (se buscaba en el PATH
  con el de LibreTeX delante). Probado en esta máquina: `auto`/`libretex` → xelatex de
  `~/.local/share/libretex`, `system` → `/usr/bin/xelatex`, los dos listados.
- Usando la app en un documento real, el usuario pidió (sin pasar de fase): (1) que Tab en
  matemáticas no indente sino que complete; (2) que `\begin` traiga sus llaves; (3) que
  recompilar no vuelva al inicio; (4) que sus comandos (`\pvec`) se autocompleten y se vean en
  el preview. Hecho: `editor/mathTab.ts` (en matemáticas, Tab solo indenta al inicio de la
  línea; si la lista aún no aparece, la pide y acepta la primera; si CodeMirror rechaza
  aceptar por su retardo de 75 ms, reintenta en vez de indentar: esa era la causa del «a
  veces»), `editor/latexCompletion.ts` (`\begin`/`\end` con `{}` y la lista de entornos
  abierta; fuente con los comandos del preámbulo, con un campo por argumento). (3) Causa:
  el `will-change` del zoom nuevo volvió `.pdfViewer` el `offsetParent` y, con páginas más
  anchas que el panel, el `scrollIntoView` de pdf.js no movía nada (ver Decisiones). (4) Causa:
  `preambleOf` cortaba el texto original en una posición calculada sin comentarios. Probado:
  tests del editor con una vista real, `\pvec` del proyecto «Guía I2» (antes no se extraía),
  recargas en WebKitGTK (8 casos se quedan en la página) y la vista previa (`\pv` → `\pvec{r}`
  con su preview; `\beg` → `\begin{}` → `\begin{cases}`).
- Antes de pasar de fase pidió (hecho): el proyecto en blanco parte con `\title{<nombre>}`
  (caracteres especiales escapados), `\author{}`, `\date{\today}` y `\maketitle`
  (`projects/ops.rs`: `blank_main`, `latex_text`; compila con XeLaTeX sin advertencias);
  `\begin{figure}` escrito como comando (cerrando la llave o eligiendo `figure` en la lista)
  trae `[htbp]`, `\centering`, `\includegraphics`, `\caption`, `\label` y agrega `graphicx` al
  preámbulo si falta (`editor/figure.ts`); los paréntesis se cierran también antes de `\]`,
  `\)`, `\\`, `\right`… en matemáticas (`closeBracketsBefore` en `editor/setup.ts`); y una fase
  nueva de respaldo con Git y GitHub (5.9, Fase 11; el pulido pasa a ser la Fase 12).
- Luego reportó que al pegar en matemáticas el cursor a veces no quedaba al final de lo
  pegado. Probado en WebKitGTK real (portapapeles de GTK, comandos Copiar/Pegar y teclas
  reales sintetizadas sobre el editor de la app): al pegar el cursor siempre queda al final.
  Lo que veía: (a) seleccionando la fórmula de derecha a izquierda el cursor queda al inicio;
  al soltar la selección (Esc/←/clic) y pegar, la copia entra *antes* de la original y, como son
  iguales, parece que el cursor quedó al inicio de lo pegado; (b) Ctrl+C sin selección copia la
  línea y CodeMirror la pegaba arriba sin mover el cursor. (b) cambiado a pedido del usuario
  (`editor/lineCopy.ts`: la línea se copia como texto normal y se pega en el cursor; Ctrl+X sin
  selección sigue quitando la línea). (a) es el comportamiento estándar de la selección y el
  usuario decidió dejarlo así.
- Después, el zoom volvió a parpadear (sin GPU, cada paso mostraba un instante la página
  siguiente). No se pudo reproducir el parpadeo en Xvfb (pinta por software); se rehízo el zoom
  para no depender de cómo compone WebKit: transformación CSS inmediata + capa nueva preparada
  oculta (como al recompilar). Se probó y descartó volver a la GPU pidiendo antes las
  operaciones de la página: en el visor real seguía fallando en 6 de 15 cargas. Medido en
  WebKitGTK (Xvfb, `PdfController` real, grabación a 60 cuadros por segundo): sin cuadros
  transitorios; salto al cambiar de capa ≤ 3 px; Ctrl+rueda rápido prepara una sola capa.
  Pendiente que el usuario lo confirme.
- Luego pidió una sección de paquetes instalados: botones «Buscar paquetes» / «Paquetes
  instalados» (`PackageBrowser`; la lista sale a `PackageList`, compartida). Rust:
  `Catalog::installed(filtro, límite)` (solo paquetes, sin colecciones ni binarios
  `*.x86_64-linux`; instalados según el backend) y comando `installed_packages`. Frontend:
  filtro con pausa, páginas de 200 («Mostrar más»), se recarga tras instalar/desinstalar,
  cambiar de distribución o «Volver a comprobar». En esta máquina: 121 con el TeX Live de
  LibreTeX, 4035 con el de pacman, ≈15 ms por consulta.
- También reportó que con XeLaTeX, tras recompilar, en su página 4 desaparecía todo lo que
  está bajo la figura 1.1 (TikZ); con LuaLaTeX no. El PDF está bien (poppler, pdf.js en
  Chromium): era el canvas en GPU de WebKitGTK (`enableHWA`). Reproducido con WebKitGTK real
  en Xvfb (PyGObject) y el `PdfController` de la app; arreglado con `enableHWA: false`.
- Fase 8: todos los ítems hechos; PR #9 (fusionado). El TeX Live temporal de las pruebas
  ya se borró.
- Último hito: «`.sty` faltante → instalar → recompilar». En Registros, cada `.sty` faltante
  dice qué paquete lo trae (`package_for_file`, se vuelve a resolver cuando cambia lo
  instalado: `statusVersion` del store) y ofrece «Instalar «x» y recompilar» (un clic:
  `tlmgr install` y, si terminó bien, `compileNow`), el comando de pacman con «Volver a
  comprobar», «Ver en Paquetes» (abre el panel con la ficha) o, si no se sabe, «Buscar en
  Paquetes». Encontrado al probarlo de verdad con el TeX Live temporal: tras instalar el
  paquete, `latexmk` respondía «Nothing to do» y dejaba el error viejo (no registra el `.sty`
  faltante como dependencia); ahora, si el log anterior tiene un error de TeX (`! …`), la
  compilación siguiente va con `-g` (`latexmk::last_run_failed`). Con `-g`: compila.
  La compilación simulada da `File 'x.sty' not found` para paquetes no instalados del catálogo.
- Antes: modo solo lectura. Con el TeX Live de pacman la ficha de un paquete no
  instalado muestra `sudo pacman -S texlive-<colección>` con botón Copiar («LibreTeX nunca
  ejecuta sudo») y «Volver a comprobar» (comando `reload_package_status`: olvida el catálogo
  en caché para releer `pacman -Qq`/`kpsewhich`, sin red). Si ningún paquete de pacman lo trae
  o la instalación es de otro tipo, sugiere el TeX Live de LibreTeX; los instalados «se
  actualizan con el sistema»; los que solo están en CTAN, a mano. `PacmanCommand` se
  reutilizará en el ítem 6.
- Antes: fichas de paquete. Clic en un resultado abre su ficha (versión, licencia,
  archivos) con Instalar / Buscar actualización → Actualizar / Desinstalar (con confirmación)
  si el backend es escribible, y siempre Documentación y Copiar `\usepackage{…}`; en el panel
  del editor, además, «Agregar al preámbulo» (`lib/packages/preamble.ts`: tras el último
  `\usepackage`, sin repetir; edita el búfer del archivo principal, guarda y salta a la
  línea). Rust: `tex/tlmgr.rs` (nombres validados, `--` antes del nombre, progreso por
  evento `package-operation`, una operación a la vez, cancelable) y comandos
  `package_operation`, `cancel_package_operation`, `check_package_update`,
  `open_package_docs`. Probado de verdad con el TeX Live temporal: `tlmgr install physics`,
  consulta de actualización y `remove` (2 s). Se quitó un «Vista previa de fórmulas» de
  relleno que había quedado repetido en Ajustes.
- Antes: catálogo y búsqueda de paquetes. `tex/tlpdb.rs` (parser del `texlive.tlpdb`:
  descripción, versión, licencia, `.sty`/`.cls` de cada paquete y su colección),
  `tex/ctan.rs` (índice de CTAN en `~/.cache/libretex/ctan/packages.json`, sin HTML; descarga
  atómica solo a pedido), `tex/catalog.rs` (búsqueda por nombre/prefijo/descripción sin
  tildes; estado según el backend: tlpdb instalado, colecciones de `pacman -Qq` o
  `kpsewhich`; paquete de pacman que lo trae; `.sty` → paquete). Comandos
  `search_packages`, `package_for_file`, `package_catalog_info`,
  `refresh_package_catalog` (el catálogo se cachea en el estado). UI: `PackageSearch`
  en la pestaña y en el panel del editor. En esta máquina: 0,5 s para armar el catálogo,
  ≈12 ms por búsqueda; `ctex.sty` → `ctex`, no instalado, `texlive-langchinese`.
- Antes: asistente del TeX Live de LibreTeX. `tex/install_tl.rs`: descarga
  `install-tl-unx.tar.gz` (crate `ureq`), lo extrae con `tar`, lee el año de
  `install-tl --version`, instala `scheme-basic` con un perfil (sin docs ni fuentes, PATH
  intacto) en `~/.local/share/libretex/texlive/<año>` y luego `tlmgr install` de
  `BASE_PACKAGES` (xetex, fontspec, lm, babel-spanish, hyphen-spanish, latexmk, synctex…).
  Progreso por evento `texlive-install`; cancelar mata el grupo y borra lo parcial;
  `state.refresh_tex_path()` al terminar. `tex/process.rs`: spawn en grupo + líneas +
  `kill_group`, compartido con latexmk. Frontend: `InstallManaged.tsx` (confirmación,
  barra por fases, registro, cancelar, reintentar). Probado de verdad en un directorio
  temporal: 51 s, 207 MB, compila la plantilla solo con ese TeX Live; cancelar a los 8 s no
  deja nada. Falta que el usuario lo haga desde la app.
- Antes: detección de backends (`tex/backends.rs`: gestionado en
  `~/.local/share/libretex/texlive/<año>`, oficial en `/usr/local/texlive` solo si `tlpkg` es
  escribible, pacman si existe `/usr/share/tlpkg/texlive.tlpdb` y `/usr/bin/pacman`, otro TeX
  del PATH como solo lectura; activo = el primero escribible). Comando `package_backends`,
  `store/packages.ts`, `components/packages/BackendInfo.tsx` en la pestaña Paquetes y en el
  panel lateral del editor. En esta máquina: TeX Live de pacman (solo lectura).
- Investigado para los ítems siguientes: el `texlive.tlpdb` de Arch trae los 8422 paquetes
  (también los no instalados), así que sin red ni root se puede resolver `.sty` → paquete
  (`tlmgr search --file`) → colección (`depend` de `collection-*`) → paquete de pacman
  (`texlive-<colección>`; probado: `ctex.sty` → `texlive-langchinese`). Con pacman,
  `tlmgr info` marca todo como instalado: la verdad es `kpsewhich`. `pacman -F` necesita
  `sudo pacman -Fy` (no se usa). API de CTAN: `/json/2.0/packages` (≈650 KB:
  `key`/`name`/`caption`) y `/json/2.0/pkg/<n>` (versión, licencia, `texlive`). `tex_path`
  se calcula al arrancar: habrá que recalcularlo tras instalar el TeX Live gestionado.
- Luego: `\boldsymbol{\ell}` daba «dynamic file 'script' failed to load». En `pnpm dev`
  Vite pre-empaquetaba la fuente de MathJax y los rangos dinámicos se registraban en otra
  copia de su clase (fallaban todos: `\ell`, `\mathbb`…; en tests y en la build no). Arreglo:
  `optimizeDeps.exclude` de la fuente. Pendiente que lo confirme.
- El usuario probó el preview y pidió dos cambios (hechos, pendiente que lo confirme): el
  tooltip va *encima* de la fórmula (anclado en su inicio, `above: true`; CodeMirror lo baja si
  no hay espacio) y ya no se vuelve transparente al hacer clic otra vez (se reemplazaba
  `className` y se perdía la clase `cm-tooltip` que da el fondo; ahora `classList` y fondo
  propio de respaldo).
- Fase 7 probada y aprobada por el usuario en `pnpm tauri dev` (preview encima de la fórmula,
  opaco, `\boldsymbol{\ell}`, `align*` con `\ihat`). Todos los ítems hechos; PR #8. Pendiente: prueba del usuario en
  `pnpm tauri dev` (aceptación: `align*` con `\ihat` en vivo, sin internet) y CI verde.
- Último hito: entornos con alineación (`lib/latexMath/renderable.ts`: `align`/`flalign` →
  `aligned`, `alignat{n}` → `alignedat{n}`, `gather` → `gathered`, `multline` →
  `multlined`, `eqnarray` → `array{rcl}`; sin `\label`/`\tag`/`\nonumber`/`\notag`), *hover*
  opcional (`hoverTooltip`, 350 ms) y ajustes `mathPreview`/`mathPreviewHover` en
  `store/settings.ts`, Ajustes y menú Ver (al cambiarlos se aplica al instante). Vista previa:
  el `align*` del ejemplo con `+ 2\ihat` se actualiza en vivo y se ve alineado.
- Antes: tooltip de matemáticas. `lib/mathjax/render.ts` (MathJax 4, TeX→SVG con las
  extensiones de 5.5 + `configmacros`; fuente NewCM con sus rangos por `import.meta.glob` y
  `mathjax.asyncLoad` que rechaza todo lo demás; un SVG por fórmula; `\i`/`\j` → ı/ȷ),
  `lib/mathjax/sanitize.ts` (el SVG se reconstruye con lista blanca), `editor/mathPreview.ts`
  (100 ms, tooltip bajo la última fila visual de la fórmula, contenido actualizado en el lugar,
  `Esc`, errores en rojo) y `components/editor/useMathMacros.ts` (macros del preámbulo desde
  los buffers; carga los incluidos que falten). Vista previa: `$\vec{v} = a\ihat + b\jhat$` y
  `equation` se ven bien y no hay pedidos a CDN.
- Antes: macros del preámbulo (`lib/macros/extract.ts`: `\newcommand`/`\renewcommand`/
  `\providecommand` con argumentos y opcional, `\DeclareMathOperator(*)` → `\operatorname`,
  `\def` con `#1#2…` en orden; sin comentarios; `collectMacros` sigue los `\input` del
  preámbulo en orden y sin ciclos). Salida con la forma de `configmacros` de MathJax.
- Antes: detector de regiones matemáticas. `lib/latexMath/regions.ts` (escáner de
  texto: delimitadores, entornos con y sin `*`, `\$`, comentarios, verbatim/`\verb`,
  `\text{$…$}` dentro de display, `$` sin cerrar hasta el fin del párrafo) y
  `editor/mathRegion.ts` (árbol Lezer: `DollarMath`, `ParenMath`, `BracketMath`, entornos con
  `BeginEnv`; usa el escáner si el árbol no llega o cruza un párrafo). Una sola tabla de casos
  (`lib/latexMath/cases.ts`) prueba los dos.
- Investigado para los ítems siguientes: MathJax 4 (`@mathjax/src` 4.1.3, estable) por la API
  directa; la fuente SVG (`@mathjax/mathjax-newcm-font`, dependencia directa) carga 120
  rangos de glifos bajo demanda con `mathjax.asyncLoad` → resolver con `import.meta.glob`
  (el cargador de componentes apunta a cdn.jsdelivr: no usarlo). Las macros van con el
  paquete `configmacros`.
- Fase 6 cerrada: PR #7 fusionado, tag `v0.6.0`.
- Fase 6 probada y aprobada por el usuario en `pnpm tauri dev` (visor, búsqueda, recompilar,
  SyncTeX, zoom). El parpadeo residual del zoom quedó como pulido de la Fase 12 (antes 11).
- Luego: el zoom del PDF iba hacia el borde izquierdo y parpadeaba. Ahora todo zoom usa
  `updateScale` de pdf.js con origen (centro de la vista en botones/menú, puntero con
  Ctrl+rueda) y dibujo diferido (`lib/pdf/zoom.ts`: `fitScale`, `zoomOrigin`,
  `wheelZoomFactor`). Medido en la vista previa: el punto bajo el puntero queda a ≤1 px y
  ninguna muestra (cada 8 ms) con una página visible sin dibujo. Pendiente que lo confirme.
- Luego: aún había, a veces, un cuadro negro entre zooms: canvas de pdf.js en la GPU
  (`enableHWA`) y fondo del panel en la capa de scroll. Pendiente que lo confirme.
- Después pidió fluidez al hacer scroll (editor y PDF) y arreglar `\[\int`: el
  renderizado ahora usa la GPU (ver Decisiones) y el `\` delante del cierre automático de
  `\[ \]`/`\( \)` ya no salta sobre su barra. Pendiente que lo confirme.
- El usuario probó la fase en `pnpm tauri dev`: todo bien salvo `Ctrl+J` (no hacía nada) y
  que el doble clic iba al párrafo y no a la palabra. Corregido (pendiente que lo confirme):
  `Ctrl+J` global y reconocido por la tecla física (`lib/shortcuts.ts`), y el doble clic
  selecciona la palabra cliqueada (`lib/pdf/sourceWord.ts`).
- Último hito: SyncTeX (`tex/synctex.rs`: parseo de `synctex view`/`edit` con fixtures reales
  en `tests/fixtures/synctex/` y una prueba de ida y vuelta con el `synctex` instalado;
  `commands/synctex.rs`: `synctex_forward` valida el archivo con `resolve_existing`,
  `synctex_inverse` solo devuelve archivos del proyecto). Frontend: `Ctrl+J` en el editor,
  botón en la barra del PDF y menú Ver → `syncToPdf()` del store → resaltado violeta que se
  desvanece; doble clic en una página → `goToLine`. Conversión de coordenadas en
  `lib/pdf/location.ts` (SyncTeX mide desde arriba; PDF, desde abajo).
- Antes: recompilar conserva página, scroll y zoom sin parpadeo: cada versión del PDF
  va en su propia capa (`.lt-pdf-layer`); la nueva se prepara oculta, vuelve al mismo punto
  (`lib/pdf/location.ts`: destino «XYZ» desde `updateviewarea`), espera a que se dibuje la
  página visible (máx. 1,5 s) y recién entonces reemplaza a la anterior. Medido en la vista
  previa: siempre una capa visible y scroll idéntico.
- Antes: visor PDF (`components/pdf/pdfController.ts` envuelve `PDFViewer` de pdf.js 6,
  cargado bajo demanda; `PdfPane.tsx`: páginas, zoom con pasos de `lib/pdf/zoom.ts`,
  Ctrl+rueda, búsqueda sin tildes ni mayúsculas, modo oscuro en `store/settings.ts`, menú con
  visor del sistema / carpeta). El PDF llega por `read_pdf` (bytes, ruta calculada en Rust) y
  se recarga tras cada compilación que lo escribe. Recursos de pdf.js locales con
  `vite/pdfjsAssets.ts`. Probado en la vista previa (Chromium); falta probarlo en WebKitGTK
  con `pnpm tauri dev` (JavaScriptCore 2.52 parsea pdf.js 6 y tiene sus APIs nuevas).
- Fase 5 aprobada por el usuario y cerrada (PR #6, tag `v0.5.0`).
- Antes (Fase 5): revisión en vivo (`lib/latexCheck/check.ts`, función pura con tests y sin
  falsas alarmas en las plantillas; `editor/liveCheck.ts`: un solo `linter` que junta los
  diagnósticos de la última compilación, mapeados con las ediciones, con los de la revisión;
  ajuste `liveCheck` en `store/settings.ts`, menú Ver y Ajustes).
- Antes: compilación solo manual (sin `autoCompile` en `project.json`, `Ctrl+S` solo
  guarda) y panel PDF provisional con «Abrir PDF» / «Mostrar en la carpeta» (comandos
  `open_pdf` / `reveal_pdf`; ruta con `latexmk::pdf_path`).
- Antes: `Ctrl+Enter` global y en el editor; compilador persistido en `project.json`
  (`update_project_meta`).
- Hoja de ruta multiplataforma (otras distros y Windows) añadida al final del plan como
  proyecto posterior, no como fases.
- Antes: panel de Registros (`components/logs/LogsPanel.tsx`: Problemas agrupados con
  salto a la línea, Log completo, Salida; «Instalar paquete» en `.sty` faltantes abre el panel
  de Paquetes hasta la Fase 8), contadores reales, diagnósticos en el editor
  (`editor/diagnostics.ts` + `lintGutter`; un paquete faltante se marca en su `\usepackage`).
- Antes: parser de logs (`src/lib/latexLog/parse.ts`) con fixtures reales de TeX Live
  2026 en `tests/fixtures/logs/` (fuentes en `sources/`).
- Antes: compilación (`tex/latexmk.rs`: argumentos, proceso en su propio grupo,
  salida por líneas, `killpg`; `tex/queue.rs`: una en curso + la última pendiente;
  `commands/compile.rs`: eventos `compile-started/output/finished` con el `.log` y el PDF;
  `clean_build`). Frontend: `store/compile.ts`, Recompilar ↔ Detener, salida en vivo en
  Registros (provisional hasta el ítem 4).
- Antes: detección de TeX (`tex/detect.rs`: PATH con TeX Live gestionado y oficial
  antepuestos y `/usr/bin/vendor_perl` de respaldo; versiones con timeout; comando
  `tex_status` cacheado) + `store/tex.ts`, `TexWarning` (comando de pacman), motores «No
  instalado» en el desplegable y sección «Distribución TeX» en Ajustes.
- Antes: esquema real (`lib/outline.ts`: títulos con llaves anidadas, sin
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
  dispatching to Wayland display` (confirmado en esta máquina, RTX 4070, driver 615). Medido
  el 2026-10-11: con `__NV_DISABLE_EXPLICIT_SYNC=1` la app sigue viva y `WebKitWebProcess`
  usa la GPU (≈55 MiB de VRAM); con el fix anterior (`WEBKIT_DISABLE_DMABUF_RENDERER=1`) no
  usa la GPU y el scroll se sentía lento.
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
| 2026-10-09 | «Sangría automática»: solo en entornos (por defecto) / también en secciones / desactivada; guardada en `localStorage` hasta la Fase 9 | Pedido del usuario: la gramática sangraba el cuerpo de las secciones y de `document` como Python |
| 2026-10-09 | Línea activa translúcida | La capa de selección de CodeMirror se dibuja detrás de las líneas; un fondo opaco la ocultaba en la línea del cursor |
| 2026-10-09 | `\[`/`\(` se cierran con un manejador propio; `\\[2pt]` (salto de línea) no se toca | `closeBrackets` solo ve el `[`/`(` |
| 2026-10-09 | PATH de TeX = TeX Live de LibreTeX → `/usr/local/texlive` → PATH del usuario → `/usr/local/bin`, `/usr/bin`, `/usr/bin/vendor_perl` | Una app lanzada desde el menú de KDE puede tener un PATH más corto que la terminal (en Arch `biber` está en `vendor_perl`) |
| 2026-10-09 | Crate `libc` (solo `killpg`) y latexmk en su propio grupo de procesos | Cancelar debe matar también el motor que lanza latexmk; `Child::kill` solo mata latexmk |
| 2026-10-09 | `shellEscape` se lee de `project.json` en Rust, nunca llega desde la webview; modo borrador = `-usepretex=\PassOptionsToPackage{draft}{graphicx}` | Seguridad (sección 4.2); el borrador acelera sin cambiar el documento |
| 2026-10-09 | Recompilar guarda antes los buffers con cambios | Se compila lo que el usuario ve |
| 2026-10-09 | Parser: pila de archivos que ignora paréntesis de mensajes y recuerda el último archivo del proyecto cerrado; descarta «Emergency stop»/«Fatal error» si hay un error real y los resúmenes «Rerun»/«There were undefined…» | Los errores de llaves llegan sin línea y justo después de cerrar el archivo; evita ruido duplicado |
| 2026-10-09 | ~~Compilación automática disparada por un contador de guardados~~ (reemplazada: compilación solo manual, ver abajo) | — |
| 2026-10-09 | `update_project_meta` solo permite cambiar `compiler` | `shellEscape` necesita una advertencia explícita y no se expone a la webview |
| 2026-10-09 | Compilación solo manual: se quita la compilación automática (UI, Ajustes, `autoCompile` de `project.json`); `Ctrl+S` solo guarda | Pedido del usuario. Los `project.json` antiguos con `autoCompile` se siguen leyendo (serde ignora el campo) |
| 2026-10-09 | Panel PDF provisional hasta la Fase 6: dice dónde está el PDF y lo abre con el visor del sistema o en el gestor (comandos Rust `open_pdf`/`reveal_pdf`, ruta calculada en Rust) | El usuario no encontraba el PDF (`.libretex/build/` está oculta) |
| 2026-10-10 | Revisión en vivo propia (`lib/latexCheck`) en vez del linter de `codemirror-lang-latex` | Mensajes en español y menos falsas alarmas: ignora comentarios, verbatim, `\verb`/`\lstinline`/`\url` y definiciones de macros; las fórmulas inline se cortan en la línea en blanco. Solo `.tex`/`.ltx`; 3 ms para 7 000 líneas |
| 2026-10-10 | Diagnósticos de compilación como `StateField` dentro del mismo `linter` que la revisión | `setDiagnostics` externo y un `linter` se pisan entre sí; así conviven y los del log siguen las ediciones |
| 2026-10-10 | Otras distros y Windows: hoja de ruta para un proyecto posterior (sección «Después de v1»), no fases de v1 | Pedido del usuario; v1 sigue siendo solo Arch, pero el código no debe impedir la portabilidad |
| 2026-10-10 | pdf.js 6 (build moderno, no *legacy*) con `PDFViewer`/`PDFFindController` de `pdfjs-dist/web/pdf_viewer.mjs` | Renderizado perezoso, zoom y búsqueda ya resueltos. El JavaScriptCore de WebKitGTK 2.52 parsea los módulos y tiene `getOrInsertComputed`, `Math.sumPrecise`, `Promise.try`, etc. |
| 2026-10-10 | El PDF llega como bytes por el comando `read_pdf` (`tauri::ipc::Response`), no por el protocolo de assets | La ruta se calcula en Rust y `.libretex/` (oculta) no necesita abrirse en el alcance de assets |
| 2026-10-10 | CMaps, fuentes estándar, wasm e ICC de pdf.js servidos/copiados por un plugin propio de Vite (`vite/pdfjsAssets.ts`) | Principio «local primero» sin otra dependencia; se omite QuickJS (sin scripting de PDF) |
| 2026-10-10 | Enlaces externos del PDF desactivados (`externalLinkEnabled = false`) | Abrirían páginas web dentro de la app; falta un camino seguro hacia el navegador del sistema |
| 2026-10-10 | Recarga con doble búfer: un `PDFViewer` por versión del PDF, la nueva oculta hasta dibujar la página visible | Conservar posición y zoom «sin saltos ni parpadeo» (5.4); `setDocument` sobre el mismo visor vuelve arriba y deja la página en blanco mientras dibuja |
| 2026-10-10 | SyncTeX directo con `Ctrl+J` (como TeXworks), botón en la barra del PDF y menú Ver; si el diseño es «solo editor», pasa a editor + PDF | `Ctrl+Alt+flechas` choca con los atajos de escritorio de KDE |
| 2026-10-10 | `synctex` se ejecuta con rutas absolutas y `cwd` en la raíz; de `edit` solo se aceptan archivos dentro del proyecto (fuera de `.libretex/`) | El archivo que llega de la webview se valida; nunca se abre un `.cls`/`.sty` del sistema ni el `.aux` |
| 2026-10-10 | `Ctrl+J`/`Ctrl+Enter` por evento DOM (editor) y en `window`, reconocidos por `code` además de `key`; `Ctrl+J` se comprueba antes que `Ctrl+Enter` | Funcionan aunque el foco esté en el PDF; en GTK `Ctrl+J` es el carácter de salto de línea y puede llegar como «Enter» (se compilaría por error) |
| 2026-10-10 | SyncTeX inverso a la palabra: se toma la palabra del doble clic (o la del puntero) y sus vecinas en la capa de texto, y se busca en ±12 líneas de la que da SyncTeX, sin tildes, mayúsculas, ligaduras ni nombres de comandos; se elige la más cercana con las mismas vecinas | SyncTeX solo da la línea (`Column:-1`) y para un párrafo suele dar la última; si la palabra no aparece (por ejemplo `\'e`), va al comienzo de la línea |
| 2026-10-10 | Fixture `tests/fixtures/pdf/ejemplo.pdf` (XeLaTeX, 23 KB) usado por el backend simulado | La vista previa del navegador muestra un PDF real; sin rutas personales dentro |
| 2026-10-11 | Wayland + NVIDIA: `__NV_DISABLE_EXPLICIT_SYNC=1` en vez de `WEBKIT_DISABLE_DMABUF_RENDERER=1`; `LIBRETEX_SAFE_RENDERER=1` como salida de emergencia | Con el renderer DMA-BUF desactivado WebKitGTK dibujaba por CPU y el scroll iba lento a 2560×1440. Probado en esta máquina: con la variable de NVIDIA no hay Error 71 y WebKit usa la GPU; sin ninguna de las dos, la app se cierra |
| 2026-10-11 | Cierre automático de `\[`/`\(`: `\` siempre se inserta; al completar `\]`/`\)` a mano se quita la barra sobrante | Antes `\` saltaba sobre la barra del cierre y `\[\int` dejaba la fórmula sin cerrar |
| 2026-10-11 | ~~Zoom del PDF con `updateScale({ scaleFactor, origin, drawingDelay: 250 })`, también para «ajustar al ancho/página» (escala calculada como pdf.js); el origen se pasa sumando `containerTopLeft` (pdf.js usa offsetTop/offsetLeft, no la posición en pantalla)~~ (reemplazado el 2026-10-12, ver abajo) | Con `currentScaleValue` pdf.js conserva la esquina superior izquierda y redibuja al instante: el zoom «iba a la izquierda» y parpadeaba. Así las páginas se estiran con CSS y se redibujan nítidas una vez |
| 2026-10-11 | ~~pdf.js con `enableHWA: true` (canvas en la GPU, como el visor de Firefox)~~ (revertido el 2026-10-12, ver abajo) y fondo propio en la capa de scroll del PDF | Con GPU, el usuario veía a veces un cuadro negro entre zooms: el estirado de canvas de CPU obliga a repintar toda la zona de scroll y un cuadro incompleto deja ver el fondo casi negro de la ventana |
| 2026-10-11 | Ctrl+rueda proporcional al desplazamiento (una muesca ≈ 10 %, el touchpad en pasos pequeños), alrededor del puntero | Como en otros visores; los pasos fijos de los botones serían bruscos con el touchpad |
| 2026-10-11 | Detección de matemáticas con el árbol Lezer y escáner de texto de respaldo, con la misma tabla de casos | El árbol es incremental (rápido en archivos grandes); el escáner cubre lo que el árbol aún no analizó y los `$` que la gramática alarga más allá de un párrafo (TeX corta ahí) |
| 2026-10-11 | Macros solo del preámbulo del archivo principal y de lo que incluye ahí; `\NewDocumentCommand` y `\def` con parámetros raros no se extraen | Es lo que pide 5.5 y cubre las macros reales del usuario; lo complejo no se puede expresar en `configmacros` |
| 2026-10-11 | MathJax 4 (`@mathjax/src` + `@mathjax/mathjax-newcm-font`, dependencia directa) por la API directa, cargado bajo demanda | Versión estable actual; el cargador de componentes apunta a cdn.jsdelivr, la API directa no. La fuente se importa explícitamente (pnpm no expone dependencias transitivas) |
| 2026-10-11 | SVG del preview reconstruido con lista blanca (`sanitizeSvg`) en vez de `innerHTML` | El `.tex` puede venir de un ZIP ajeno; sin scripts, `on*`, `foreignObject` ni enlaces externos aunque MathJax ya escapa el texto |
| 2026-10-11 | `\i`/`\j` → ı/ȷ antes de MathJax; `linebreaks.inline` desactivado | `textmacros` no conoce `\i`/`\j` (las macros `\ihat`/`\jhat` del usuario fallaban); MathJax 4 parte las fórmulas inline en varios SVG |
| 2026-10-11 | Preview matemático encima de la fórmula | Pedido del usuario: así no tapa lo que se escribe debajo; puede tapar líneas anteriores mientras el cursor está en la fórmula |
| 2026-10-11 | `@mathjax/mathjax-newcm-font` excluido del pre-empaquetado de Vite (`optimizeDeps.exclude`) | Sus rangos dinámicos importan la clase de la fuente por ruta relativa; pre-empaquetada había dos copias y ningún rango cargaba en desarrollo |
| 2026-10-11 | Crate `ureq` 3 (rustls, raíces incluidas) para HTTP; `tar` del sistema para extraer | Descarga del instalador y del índice de CTAN sin depender de curl/wget ni de los certificados del sistema; `tar` está en todo Linux (en Windows hará falta otra cosa) |
| 2026-10-11 | TeX Live de LibreTeX = `scheme-basic` + paquetes sueltos con `tlmgr` (no colecciones) | Con `collection-xetex/langspanish/latexrecommended` ocupaba 504 MB; así son 207 MB y lo demás se instala bajo demanda |
| 2026-10-11 | `tex_path` en un `RwLock` y `refresh_tex_path()`; errores `cancelled` y `network` | El TeX Live recién instalado se usa sin reiniciar la app |
| 2026-10-11 | Catálogo = `texlive.tlpdb` (caché descargada → el completo del sistema → el de la instalación) + índice de CTAN; estado instalado según el backend | Busca sin red con el tlpdb que trae Arch; con pacman `tlmgr info` marca todo como instalado, así que se usan las colecciones de `pacman -Qq` |
| 2026-10-11 | Desinstalar = `tlmgr remove --force <paquete>` (tras confirmar); nombres de paquete validados (`[A-Za-z0-9._+-]`, sin `-`/`.` inicial) y `--` antes del nombre | Sin `--force` tlmgr se niega a quitar paquetes de los que depende una colección; la validación impide que un nombre se lea como opción |
| 2026-10-11 | «Actualizable» solo tras «Buscar actualización» (`tlmgr update --list <paquete>`), no en cada búsqueda | Consultar el repositorio usa la red: solo a pedido del usuario |
| 2026-10-11 | Documentación: `texdoc -l -M` si hay documentación local; si no, la página del paquete en CTAN con el navegador del sistema (opener desde Rust) | El TeX Live de pacman y el de LibreTeX se instalan sin docs; abrir la página es una acción explícita |
| 2026-10-11 | Tras una compilación con error de TeX la siguiente se fuerza (`latexmk -g`), decidido en Rust leyendo el log anterior | latexmk no registra los archivos faltantes como dependencias: tras instalar el paquete decía «Nothing to do». Solo después de un fallo, para no repetir pasadas de BibTeX/Biber sin necesidad |
| 2026-10-11 | «Instalar y recompilar» desde Registros instala sin diálogo de confirmación | El botón nombra el paquete y es la acción explícita del usuario; desinstalar sí confirma |
| 2026-10-12 | El usuario elige el TeX (`auto` por defecto = el de LibreTeX si está instalado; `libretex`; `system`) y esa elección vale para compilar y para el gestor de paquetes; se guarda en `settings.json` desde Rust | Pedido del usuario: TeX previo opcional y poder volver al de pacman. Una sola elección evita compilar con un TeX y gestionar paquetes de otro |
| 2026-10-12 | El TeX del sistema se detecta con el PATH del usuario (sin el TeX Live de LibreTeX delante) | Con el PATH de compilación, el `kpsewhich` encontrado era el de LibreTeX y el de pacman desaparecía de la lista |
| 2026-10-12 | pdf.js con `enableHWA: false` (canvas por CPU) | Con GPU, WebKitGTK 2.52 perdía en el primer dibujo de un PDF nuevo todo lo que venía tras una figura TikZ en PDFs de XeLaTeX (xdvipdfmx): la mitad inferior de la página 4 del usuario. Reproducido en WebKitGTK (Xvfb + PyGObject, `PdfController` real): con GPU falla en 3 de 4 recargas; sin GPU, 0 de 12. Puede volver algo del parpadeo del zoom (pulido de la Fase 12) |
| 2026-10-12 | Zoom en dos tiempos: al instante, `transform` CSS sobre las páginas (capa propia con `will-change`, sin relayout ni scroll), anticipando centrado y bordes (`lib/pdf/zoom.ts`: `axisTranslate`); 200 ms después del último paso, la nueva escala se prepara en una capa oculta en el mismo punto (PDF) y se cambia al estar dibujada, como al recompilar | Con canvas por CPU, el `updateScale` de pdf.js (relayout + scroll + repintado) hacía que el usuario viera en cada zoom un cuadro con la página siguiente. El doble búfer ya era limpio en su máquina al recompilar. Medido en WebKitGTK: ningún cuadro transitorio y ≤ 3 px de salto al cambiar de capa |
| 2026-10-12 | `.pdfViewer` con `width: max-content` y `min-width: 100%` | Con `will-change` es el `offsetParent` de las páginas; si desbordaba en horizontal, pdf.js scrolleaba en él (sin efecto) y recompilar con zoom iba a la página 1 |
| 2026-10-12 | Tab en matemáticas: completa (pide la lista y acepta la primera), nunca indenta salvo al inicio de la línea; `interactionDelay` de CodeMirror fijado explícitamente (75 ms) | Pedido del usuario. CodeMirror rechaza aceptar justo después de abrir la lista y Tab terminaba indentando |
| 2026-10-12 | Comandos del usuario en el autocompletado (`boost` 2, detalle «comando del documento», un campo de snippet por argumento obligatorio) y `\begin`/`\end` con llaves + lista de entornos | Pedido del usuario; reusa las macros que ya extrae el preview |
| 2026-10-12 | Ctrl+C/Ctrl+X sin selección: copian la línea como texto normal (manejador propio de `copy`/`cut`), así se pega en el cursor | Pedido del usuario; CodeMirror pegaba esa copia arriba de la línea actual sin mover el cursor |
| 2026-10-16 | Paréntesis/corchetes/llaves se cierran antes de una barra solo si lo que sigue cierra o espacia (`\]`, `\)`, `\\`, `\,`, `\right`, `\end`): `languageData` de `closeBrackets` según la posición | En display el cursor suele estar antes de `\]` y no se cerraban; antes de otros comandos se suele estar envolviendo |
| 2026-10-16 | `\begin{figure}` como comando = el mismo esqueleto del botón de figura, más `graphicx` en el preámbulo si el archivo tiene uno sin él | Pedido del usuario: «todo lo necesario para incluir las imágenes» |
| 2026-10-16 | Respaldo con Git/GitHub como fase propia (11) separada del historial local (Fase 10): usa el `.git` normal del proyecto, opcional, sin guardar credenciales | Pedido del usuario; el historial interno sigue en `.libretex/history.git` para no interferir con el repositorio del usuario |
| 2026-10-16 | Lo que compone la tecla muerta `^`: el corchete final se cierra como si se hubiera escrito solo, y en matemáticas `²`/`⁽`/`â`… se escriben `^2`/`^(`/`^a` | El usuario usa el teclado latinoamericano (`^` = AltGr+{ muerta); fuera de matemáticas `â` sigue siendo `â` |
| 2026-10-16 | Sesión por proyecto (pestañas, cursor y scroll por archivo, lugar y zoom del PDF, diseño) en `localStorage`, escrita con pausa de 400 ms | Pedido del usuario. Es estado de la vista, como los tamaños de paneles (también en `localStorage`), no un ajuste ni parte del proyecto; cerrar la ventana no da una última oportunidad fiable de guardar |
| 2026-10-17 | Buscar en el proyecto lee el disco tras guardar los búferes con cambios; reemplazar escribe en Rust (atómico) y recarga los abiertos | Una sola implementación (Rust) para archivos abiertos y cerrados; es lo mismo que hace compilar |
| 2026-10-17 | «Palabra completa» con `\b{start-half}`/`\b{end-half}` de `regex` | Con `\b`, `\frac` nunca coincidía (la barra no es letra) |
| 2026-10-17 | `@codemirror/merge` (de la tabla del stack) ya en la Fase 9: su `diff` aplica solo lo cambiado cuando un archivo abierto cambia fuera del editor | Reemplazar el texto completo llevaba el editor al inicio y deshacía todo de una vez |
| 2026-10-17 | Ortografía con `nspell` en un web worker por idioma; `dictionary-es`/`dictionary-en` empaquetados con un alias de Vite (`@dictionaries/es.aff?url`) | Sus paquetes solo exportan un cargador de Node; el español tarda ~0,5 s y ~80 MB en cargar, fuera del hilo del editor. Licencias: es (GPL/LGPL/MPL), en (MIT y BSD), compatibles con GPL-3.0 |
| 2026-10-17 | Sugerencias reordenadas por una distancia de tecleo propia | `nspell` las da sin un orden útil («teh» dejaba «the» en el lugar 9) |
| 2026-10-17 | Idioma de ortografía por proyecto (`spellLang`: es/en/off) en el menú Ver; diccionario personal global (`~/.config/libretex/dictionary.txt`) que vale para los dos idiomas | Lo pide 5.1 (`spellLang` en `project.json`); los nombres propios y términos del usuario se repiten entre proyectos |
| 2026-10-17 | Ajustes en `settings.json` vía Rust (ya no en `localStorage`), lectura tolerante por campo y claves desconocidas conservadas; la carpeta de proyectos solo por diálogo nativo | Lo pide la aceptación de la Fase 9 (persisten entre reinicios); principio de que la webview no envía rutas arbitrarias |
| 2026-10-17 | «Ruta de la distribución TeX» (5.8) = elegir entre las detectadas (`DistributionPicker`, con sus rutas a la vista), sin carpeta arbitraria | El TeX del sistema ya se busca en el PATH del usuario, `/usr/local/texlive` y `/usr/bin/vendor_perl`; una ruta libre añadiría otro camino de detección sin un caso real |
| 2026-10-17 | Keymaps `@replit/codemirror-vim` 6 y `@replit/codemirror-emacs` 6 (MIT), importados bajo demanda | Fuera de la tabla del stack: son las implementaciones mantenidas para CodeMirror 6; cargarlos solo al elegirlos no engorda el editor por defecto |
| 2026-10-17 | Fuentes del editor: las monoespaciadas instaladas (`fc-list`), sin empaquetar ninguna | Local primero sin sumar megas; «Predeterminada» usa la pila de `--font-mono` |
| 2026-10-17 | En matemáticas el autocompletado ordena primero los comandos de matemáticas (impulso +50 / −60) sin ocultar los de texto | Pedido del usuario; ocultarlos impediría escribir `\text{…}\par` raros pero válidos |
| 2026-10-17 | Barra de búsqueda del editor propia (React dentro de un panel de CodeMirror, `createPanel`), búsqueda literal | El panel por defecto no seguía el diseño; sin `literal`, CodeMirror convierte `\n` y `\t` de la búsqueda en salto de línea y tabulación (`\nabla`, `\theta`) |
| 2026-10-17 | Pestañas de proyectos con instantáneas de los stores (un proyecto en los stores a la vez) en vez de stores por proyecto o ventanas | El usuario eligió pestañas en una ventana; las instantáneas no obligan a reescribir ~200 usos de los stores y conservan todo (incluido el deshacer, como JSON). El PDF se vuelve a dibujar al volver, en su lugar (memoria de sesión) |
| 2026-10-17 | `git2` sin funciones de red y con `vendored-libgit2` | El historial es solo local; empaquetar libgit2 da el mismo comportamiento en Arch, en el CI y en el AppImage |
| 2026-10-17 | Historial = repositorio desnudo con work tree asignado al abrir, firma «LibreTeX <libretex@localhost>», tipo de versión como línea final del mensaje | No toca el `.git` del usuario ni expone su identidad; el tipo viaja con el commit sin archivos aparte |
| 2026-10-17 | Versiones automáticas cada 10 minutos por defecto (ajustable, 0 = no) y tras compilar bien, solo si algo cambió | Lo pide 5.7; sin cambios no se crean versiones vacías |
| 2026-10-18 | ZIP de exportación = todos los archivos del usuario salvo `.libretex/`, `.git/` y salidas de LaTeX, sin aplicar su `.gitignore`; diálogos de guardado desde Rust | Un ZIP para Overleaf debe compilar allá (datos y `.latexmkrc` incluidos); la webview no envía rutas de destino |
| 2026-10-18 | Respaldo: `git2` para lo local (activar, cambios, respaldar, restaurar) y el `git`/`gh` del sistema solo para la red (subir, traer, crear el repositorio) | `git2` está compilado sin red; el `git` del sistema usa la autenticación que el usuario ya tiene (credential helper, `gh auth setup-git`, agente ssh) sin que LibreTeX guarde tokens |
| 2026-10-18 | Respaldo solo con el `.git` propio de la carpeta del proyecto, nunca el de una carpeta superior | Respaldar con el repositorio de una carpeta padre metería archivos ajenos al proyecto; se avisa y al activar se crea uno propio |
| 2026-10-18 | Autor de los respaldos: el de `git config`; si no hay, se pide una vez y se guarda en `settings.json` (`gitName`/`gitEmail`) y en la config local del repositorio, sin tocar `~/.gitconfig` | «Se pide una vez» sin cambiar la configuración global del usuario; otras herramientas ven el mismo autor en ese repositorio |
| 2026-10-18 | Lo común del historial y el respaldo en `gitops.rs`; `.libretex/` nunca se registra (filtro en el código, no solo en el `.gitignore`) | Una sola implementación de registrar/diff/restaurar; si el usuario borra la línea del `.gitignore` no se sube el historial interno |
| 2026-10-18 | Traer cambios = `git fetch` + `git merge --ff-only` del sistema, tras comprobar con git2 que no hay divergencia; subir nunca usa `--force` | Lo pide 5.9 (solo *fast-forward*, explicar la divergencia); `merge --ff-only` actualiza archivos y se niega a pisar cambios sin respaldar |
| 2026-10-18 | URLs de remotos: solo `https://` sin usuario/contraseña y `git@host:ruta`; `--` antes de la rama y sin shell | Un token en la URL quedaría en `.git/config`; nada que llegue de la webview puede leerse como opción de git (`--upload-pack`, `ext::`) |
| 2026-10-18 | Programas de red sin preguntas (`GIT_TERMINAL_PROMPT=0`, `GH_PROMPT_DISABLED=1`, ssh `BatchMode`), `LC_ALL=C` para clasificar errores, 15 min máximo y cancelables | Una app gráfica no puede responder a un prompt de terminal; si falta autenticación se explica cómo configurarla |
| 2026-10-18 | Importar desde GitHub = `git clone` del sistema a una carpeta nueva del directorio de proyectos; la lista de repositorios con `gh repo list` al abrir el diálogo | Abrir «Desde GitHub» es pedir esa consulta; el clon conserva la historia y deja `origin` y la rama remota listos para Subir/Traer |
| 2026-10-18 | `axe-core` como dependencia de desarrollo (solo tests) | Revisión automática de accesibilidad en CI; no se empaqueta en la app |
| 2026-10-18 | La cruz de las pestañas es solo para el mouse; con el teclado, Supr cierra y las flechas recorren | Un botón dentro de una pestaña (`role="tab"`) es un control anidado que los lectores de pantalla no anuncian bien (patrón ARIA de pestañas) |
| 2026-10-18 | Violeta de acento en dos tokens: `accent` (fondo de botones, texto blanco 4,87:1) y `accent-text` (texto/íconos sobre el cromo oscuro) | El mismo violeta no puede ser fondo con texto blanco y texto sobre fondo oscuro a la vez cumpliendo AA |
| 2026-10-18 | `activateOnTypingDelay` de 15 ms en vez de 100 | Pedido del usuario; las fuentes de autocompletado son síncronas (~2 ms), así que esperar a que se deje de escribir solo agregaba retraso |
| 2026-10-18 | Content-Security-Policy: `default-src 'self'`, scripts propios + `wasm-unsafe-eval` (pdf.js), estilos en línea (CodeMirror y MathJax los inyectan), imágenes del protocolo de assets, IPC; nada de internet ni `eval` | La app abre `.tex`, PDF y ZIP ajenos: una inyección no puede cargar ni enviar nada fuera |
| 2026-10-18 | Paquete de Arch = contenido del `.deb` de Tauri, desde el checkout local | El `.deb` ya trae el layout que Tauri espera (`/usr/lib/LibreTeX`), `.desktop` e íconos; el repo es privado y el PKGBUILD vive en él |
| 2026-10-18 | Comandos de paquetes en una tabla propia, ofrecidos solo si el documento carga el paquete | La gramática trae muy pocos; ofrecer todos siempre llenaría la lista de comandos que no compilan |
| 2026-10-18 | Memoria de autocompletado por proyecto en `localStorage`, con impulso acotado (+30) | Pedido del usuario («en ese documento»); es estado de la vista como la sesión; acotado para no tapar lo que se escribe completo ni el orden de matemáticas |
| 2026-10-08 | Identidad git local del repo: `GASDJUGA` + correo noreply de GitHub | No había identidad git global; evita exponer el correo personal |
