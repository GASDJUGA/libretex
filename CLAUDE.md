# CLAUDE.md — LibreTeX

> Este archivo es la fuente de verdad del proyecto. Léelo completo al inicio de cada sesión,
> retoma desde el primer ítem sin marcar del **Plan de construcción** y mantén actualizadas
> las secciones **Estado actual** y **Decisiones**.

---

## 0. Plataforma de la sesión (léelo primero)

LibreTeX v1.0.0 está terminado y publicado para Linux. El trabajo sigue en **tres líneas, en
el mismo repositorio**, cada una en su propio chat y su propia máquina. Al empezar, mira en
qué sistema estás con `uname -s` (y `uname -m`; en Windows, Claude Code usa Git Bash, donde
`uname -s` da `MINGW64_NT-…`/`MSYS_NT-…`; en PowerShell, `$env:OS` es `Windows_NT`) y sigue
la línea que corresponde:

- **`Linux` → desarrollo general** (máquina Arch del usuario, sección 2). Mejoras y arreglos de
  la app; nada específico de macOS ni de Windows salvo que el usuario lo pida.
- **`Darwin` → línea macOS** (el Mac del usuario, sección 2b). Llevar LibreTeX a macOS
  siguiendo el **Plan macOS** (sección 9b), desde su primer ítem sin marcar.
- **`MINGW*`/`MSYS*`/`CYGWIN*` (Windows) → línea Windows** (el PC con Windows 11 del usuario,
  sección 2c). Llevar LibreTeX a Windows siguiendo el **Plan Windows** (sección 9c), desde su
  primer ítem sin marcar.

Sin romper las otras plataformas: lo específico de una va detrás de
`#[cfg(target_os = "...")]` / `#[cfg(windows)]` o en `src-tauri/src/platform/` (Rust) y de
`lib/platform.ts` (interfaz), y el CI de las demás debe seguir verde.

Las tres líneas comparten este archivo: cada una actualiza **Estado actual** (con su prefijo,
«Linux:», «macOS:» o «Windows:») y **Decisiones**. Antes de empezar, `git pull` para traer lo
que hicieron las otras; si hay cambios en `main` que la rama en curso no tiene, mézclalos.

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

## 2. Entorno del desarrollador (Linux)

- **SO:** Arch Linux, KDE Plasma sobre **Wayland**, GPU **NVIDIA**.
- **Shell del usuario: zsh.** Cuando le pidas que ejecute algo, da comandos compatibles con
  zsh/bash (`export VAR=valor`). Tus propios comandos en la herramienta
  Bash pueden ser bash normal.
- **GitHub CLI (`gh`) ya autenticado.** Verifícalo igualmente en la Fase 0.
- El usuario trabaja habitualmente con **XeLaTeX + babel (español)**: es el caso de uso
  principal y la plantilla por defecto.
- **Nunca uses `sudo`.** Si falta un paquete del sistema, detente y entrégale al usuario el
  comando exacto de `pacman` para que lo ejecute él.

### 2b. Entorno en macOS (línea macOS)

- El Mac del usuario; la arquitectura (`uname -m`: `arm64` Apple Silicon o `x86_64` Intel) y
  la versión de macOS (`sw_vers`) se anotan en **Estado actual** al empezar.
- **Shell: zsh** (el de macOS). Comandos compatibles con zsh.
- **Nunca uses `sudo`** ni instales nada global sin avisar. Lo que falte se le entrega al
  usuario como comando exacto, normalmente de **Homebrew** (`brew install …`; si no tiene
  Homebrew, el instalador oficial de https://brew.sh). Lo que pida contraseña de
  administrador (MacTeX, `xcode-select --install`) lo ejecuta él.
- Prerrequisitos de Tauri 2 en macOS: Xcode Command Line Tools (`xcode-select --install`),
  Rust con `rustup` (`brew install rustup` + `rustup-init`, o https://rustup.rs), Node 26 y
  pnpm (`brew install pnpm`: Node 26 ya no trae corepack; usa la versión de `packageManager`), `gh` (`brew install gh` y
  `gh auth login`, para PR y releases).
- TeX: **MacTeX** (`brew install --cask mactex-no-gui`), que instala en `/usr/local/texlive/<año>`
  con los enlaces en `/Library/TeX/texbin`; su `tlmgr` necesita `sudo`.
- El webview es **WKWebView** (el WebKit del sistema, como Safari), no WebKitGTK: lo dicho en
  este archivo sobre WebKitGTK, Wayland, NVIDIA o Xvfb no aplica tal cual en macOS; las pruebas
  visuales se hacen en el Mac (capturas con `screencapture`).

### 2c. Entorno en Windows (línea Windows)

- El PC del usuario con **Windows 11**; la arquitectura (`uname -m` en Git Bash, o
  `$env:PROCESSOR_ARCHITECTURE`: `AMD64`/`ARM64`) y la versión (`winver` /
  `[Environment]::OSVersion`) se anotan en **Estado actual** al empezar.
- **Claude Code en Windows usa Git Bash** para sus comandos (rutas `/c/Users/...`); al usuario
  dale comandos de **PowerShell**, que es su terminal.
- **Nunca pidas ni uses permisos de administrador** (nada de «Ejecutar como administrador»,
  `runas`, ni instalar para todos los usuarios sin avisar). Lo que falte se le entrega al
  usuario como comando exacto, normalmente de **winget** (`winget install --id … -e`); si pide
  confirmación de UAC, la acepta él.
- Prerrequisitos de Tauri 2 en Windows: **Microsoft C++ Build Tools** (Visual Studio 2022 Build
  Tools con «Desarrollo para el escritorio con C++»: `winget install
  Microsoft.VisualStudio.2022.BuildTools` y elegir esa carga de trabajo), **WebView2** (ya viene
  en Windows 11), Rust con `rustup` y la toolchain **MSVC** (`winget install Rustlang.Rustup`),
  Node 26 y pnpm (`winget install --id pnpm.pnpm -e`: Node 26 ya no trae corepack; usa la
  versión de `packageManager`), **Git for Windows**
  (`winget install Git.Git`: trae Git Bash, y también `gpgv` en `C:\Program
  Files\Git\usr\bin`) y `gh` (`winget install GitHub.cli` + `gh auth login`, para PR y
  releases).
- TeX: **MiKTeX** (`winget install MiKTeX.MiKTeX`, instalación de usuario, instala paquetes
  sin administrador) o **TeX Live** para Windows (`install-tl-windows`). `latexmk` es un script
  de Perl: TeX Live trae su Perl; con MiKTeX hace falta Perl aparte (Strawberry Perl:
  `winget install StrawberryPerl.StrawberryPerl`).
- El webview es **WebView2** (Chromium/Edge), no WebKit: lo dicho en este archivo sobre
  WebKitGTK, Wayland, NVIDIA, Xvfb o WKWebView no aplica en Windows (en general, lo que funciona
  en la vista previa de Chromium funciona igual ahí). Capturas para pruebas visuales:
  PowerShell con `System.Windows.Forms`/`System.Drawing`, o pedirle una al usuario.
- Git: el repositorio fija LF con `.gitattributes` (`* text=auto eol=lf`), así que
  `core.autocrlf` no cambia los archivos al clonar.

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
- Izquierda: menús **Archivo, Editar, Insertar, Ver, Formato, Ayuda** (sin logo: la pestaña
  Inicio, justo encima, ya vuelve al inicio).
- Centro: nombre del proyecto con desplegable (renombrar, ajustes del proyecto, archivo
  principal, compilador).
- Derecha: **Recompilar** como un ícono de *play* (con su desplegable y el indicador de
  errores) y **Exportar** (reemplaza al "Share" de Overleaf).

**Riel de iconos a la izquierda**
- Archivos, Buscar en el proyecto, **Historial**, **Diseño** (editor + PDF / solo editor /
  solo PDF / PDF en ventana aparte; menú al costado), Paquetes, Registros/errores, Respaldo.
  Abajo: Ayuda y Ajustes.

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
- **Varias ventanas** (pedido del usuario, como en un navegador): arrastrar una pestaña fuera
  de la ventana la abre en una ventana nueva; soltarla sobre otra ventana la mueve allí;
  también desde su menú contextual. Un proyecto está abierto en una sola ventana a la vez.
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

Tema de la interfaz (Índigo por defecto, Grafito, Bosque, Océano, Claro), fuente y tamaño del
editor, tema del editor, keymap (normal / Vim / Emacs), sangría
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
- **El repositorio es público** (desde el 2026-11-07) y `main` está protegida: los cambios
  entran solo por PR con el CI verde; no se puede subir directo, forzar ni borrar `main`, y los
  tags `v*` no se mueven ni se borran. Nada de datos personales en commits ni archivos: el
  autor de los commits es `GASDJUGA <282358121+GASDJUGA@users.noreply.github.com>` en las tres
  máquinas (`git config user.email`), y en logs, fixtures y capturas van usuarios y rutas de
  ejemplo («ana», «UsuarioWin», `~/LibreTeX`). El repositorio privado anterior quedó archivado
  como `libretex-privado` (con los PR #1–#29).
- **Cada release lleva sus notas de cambios** (pedido del usuario): antes de crearlo, escribir
  `docs/releases/<versión>.md` (cómo instalar en cada plataforma, **«Novedades respecto de
  <versión anterior publicada>»** por plataforma y comunes, arreglos y problemas conocidos) y
  agregar esa versión arriba de todo en `CHANGELOG.md` (lo nuevo respecto de la anterior, con
  fecha). El release se crea con `gh release create v<versión> --notes-file
  docs/releases/<versión>.md`; si las notas cambian después, `gh release edit v<versión>
  --notes-file …`. Cada línea (Linux, macOS, Windows) suma lo suyo a esas notas.
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
- [x] Autocompletado de todo comando de los paquetes cargados (leído de sus `.sty`, como
      `\hslash` de amssymb), entornos propios en `\begin{}` (`\newtcolorbox`, `\newtcbtheorem`…)
      y vista previa con `<` (pedidos del usuario).
- [x] Interfaz menos parecida a Overleaf y temas (pedido del usuario): sin el logo redundante,
      Recompilar como ícono de *play*, Historial y Diseño en el riel, temas de la interfaz.
- [x] Pegar: el cursor queda al inicio de lo pegado en vez de al final (pedido del usuario).
      El usuario encontró el caso (pegar de una fórmula a un entorno nuevo): el cursor del
      navegador se reescribe tras pegar; pendiente que lo confirme.
- [x] Resaltado del paréntesis pareja más suave: el marco se confundía con el cursor.
- [x] Tab dentro de los argumentos de algo recién completado (`\tilde` en `\braket{}{}`
      quedaba sin llaves) y `\left(` → `\right)` (pedidos del usuario).
- [x] Varias ventanas (pedido del usuario): arrastrar una pestaña fuera abre una ventana nueva,
      soltarla sobre otra ventana la mueve allí; un proyecto en una sola ventana.
- [x] Auditoría de rendimiento y seguridad (pedido del usuario): proyectos «de confianza»
      (shell escape y `.latexmkrc` solo si el usuario confía), archivo principal validado,
      ZIP sin `.libretex/`/`.git/` y con tamaños comprobados, un solo worker de pdf.js, firma
      del instalador de TeX Live, autoguardado sin releer árbol ni índice completos.
- [x] Zoom out muy rápido del PDF: la vista puede saltar a otra página (pedido del usuario).
      Con el video del usuario: el tope del scroll del zoom visual escalaba los márgenes entre
      páginas; pendiente que lo confirme.
- [x] Pegar imágenes del portapapeles (pedido del usuario: una captura de pantalla con Ctrl+V):
      diálogo con el nombre, carpeta por proyecto (raíz por defecto), figura insertada;
      `graphicx` en los proyectos nuevos; `itemize`/`enumerate` traen su primer `\item`.
- [x] Zoom del PDF: quitar el parpadeo residual que a veces queda en WebKitGTK entre zooms
      (pedido del usuario al cerrar la Fase 6). Aceptado por el usuario como está («pasable»);
      «PDF en ventana aparte» queda «Próximamente» en v1.
- [x] Capturas en `docs/screenshots/` y README final.
- [x] `pnpm tauri build` (AppImage) y un `PKGBUILD` para Arch.
- [x] `gh release create v1.0.0` con los artefactos (AppImage y paquete de Arch).
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

**B. Windows:** en curso, en su propia línea: ver la sección 0 y el **Plan Windows** (9c).

**C. macOS:** en curso, en su propia línea: ver la sección 0 y el **Plan macOS** (9b).

**Reglas desde ya (en v1):** el código específico de una plataforma va detrás de
`#[cfg(...)]` y, cuando crezca, en `src-tauri/src/platform/`. Rutas con `Path`/`PathBuf`
(sin concatenar `/` en Rust). Nada de comandos de shell. Cualquier supuesto de Arch (por
ejemplo `/usr/bin/vendor_perl` o los grupos de pacman) se documenta como tal.

---

## 9b. Plan macOS (línea macOS, pedido del usuario tras publicar v1.0.0)

Mismas reglas que el plan principal (sección 8 para «terminado», sección 7 para git): una rama
por fase (`mac-N-nombre`, desde `main` al día), un commit + push por ítem, PR a `main` con el CI
verde al cerrar cada fase. Al terminar la fase M3, versión **1.1.0** (`package.json`,
`Cargo.toml`, `tauri.conf.json`, `pkgver` del PKGBUILD) y tag `v1.1.0`; el release, solo con
confirmación del usuario. La verificación manual es con `pnpm tauri dev` en el Mac.

Lo que hoy depende de Linux (revisado al publicar v1.0.0; confírmalo con
`grep -rn 'cfg(target_os\|cfg(unix' src-tauri/src` y compilando):

| Dónde | Qué pasa en macOS |
|---|---|
| `projects/trash.rs` | `trash::os_limited` (listar/restaurar) **no existe en macOS: no compila**. Papelera de la app |
| `tex/detect.rs` (`FALLBACK_DIRS`) | Rutas de Arch; falta `/Library/TeX/texbin` (MacTeX) y `/opt/homebrew/bin` |
| `tex/backends.rs`, `commands/packages.rs`, `tex/tlpdb.rs` | Backend «pacman»; MacTeX en `/usr/local/texlive` con `tlmgr` que pide `sudo` |
| `tex/install_tl.rs` | TeX Live de LibreTeX: `install-tl` sirve en macOS (`universal-darwin`); usa `tar` (lo hay) y `gpgv` (no viene: `brew install gnupg`) |
| `platform/clipboard.rs` | Pegar imágenes solo con GTK; en macOS devuelve `None` |
| `settings.rs` (`monospace_fonts`) | Usa `fc-list` (no está en macOS) |
| `commands/system.rs` | Memoria del equipo de `/proc/meminfo` (en macOS, `sysctl hw.memsize`) |
| `main.rs` | Arreglos de WebKitGTK/NVIDIA (ya solo en Linux) |
| `lib/shortcuts.ts`, `App.tsx`, `components/pdf/PdfPane.tsx` | Atajos con `ctrlKey`: en macOS son con Cmd (`metaKey`); CodeMirror ya usa `Mod-` |
| `lib/shortcutList.ts`, menús, tooltips | Textos «Ctrl+…»: en macOS «⌘…» |
| `tauri.conf.json` (`bundle.targets`) | Solo `appimage`: en macOS `app`/`dmg` (`tauri.macos.conf.json`) |
| `state.rs` (`directories`) | Datos en `~/Library/Application Support/…`, no en las rutas XDG de 5.1 |

### Fase M0 — Preparación en el Mac
- [x] Verificar entorno (2b): `uname -m`, `sw_vers`, `xcode-select -p`, `rustc`/`cargo`,
      `node`, `pnpm`, `gh auth status`, `latexmk -v`, `xelatex --version`, `synctex help`.
      Lo que falte: el comando exacto de `brew` para el usuario.
- [x] Rama `mac-0-preparacion`; `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
      (el frontend debería pasar igual) y `cargo test`; anotar lo que falle en **Estado actual**.

### Fase M1 — Compila y abre
- [x] Que `cargo build` compile en macOS: la Papelera de la app (`projects/trash.rs`) con lo que
      macOS permita (el `trash` crate solo envía a la papelera; restaurar puede hacerse moviendo
      desde `~/.Trash` lo que LibreTeX registró en `trashed.json`, o dejar la vista con un aviso);
      revisar cada `cfg(target_os = "linux")`.
- [x] `pnpm tauri dev` abre la ventana y el inicio. Menú de la app de macOS: comprobar que
      Cmd+C/V/X/Z/A lleguen al editor (en macOS el webview los recibe por el menú Edición).
- [x] CI: job `macos-latest` con `cargo test` y `pnpm test` (en repos privados un minuto de
      macOS cuenta 10: correrlo en las ramas `mac-*` y en `main`, no en cada push de Linux).

### Fase M2 — Funciones con diferencias
- [x] TeX: MacTeX detectado (`/Library/TeX/texbin` en el PATH de compilación, también lanzada
      desde el Dock, que no hereda el PATH de la terminal); backend de paquetes «MacTeX» de solo
      lectura con el comando `sudo tlmgr install …` para copiar (como hoy pacman); el TeX Live de
      LibreTeX en macOS (instalar, verificar con `gpgv`, compilar con él).
- [x] Atajos con Cmd y textos con ⌘ (tabla de arriba), sin cambiar Linux.
- [x] Pegar imágenes: primero comprobar si WKWebView entrega la imagen en el evento `paste` (si
      sí, no hace falta Rust); si no, leer `NSPasteboard` desde `platform/clipboard.rs`.
- [x] Fuentes monoespaciadas y memoria del equipo sin `fc-list` ni `/proc`.
- [x] Ventanas: barra de título de macOS, varias ventanas y arrastre de pestañas, «Mostrar en
      Finder», cerrar la última ventana (en macOS la app suele seguir abierta).
- [x] Visor PDF en WKWebView: dibujo, zoom (revisar `enableHWA` y el parpadeo), SyncTeX;
      vista previa de MathJax, ortografía (workers), CSP.
- [x] Rutas de datos (`~/Library/Application Support`) en el README y en Ajustes → Rutas.

### Fase M3 — Distribución
- [x] `pnpm tauri build` produce `.app` y `.dmg` (`tauri.macos.conf.json`); binario universal
      (`--target universal-apple-darwin`) si el usuario lo quiere.
- [x] Firma y notarización: opcional (cuenta de Apple Developer del usuario). Sin firma, la app
      se abre la primera vez con clic derecho → Abrir; explicarlo en el README.
- [ ] README: instalación en macOS; versión 1.1.0, tag y release (con confirmación).
      Hecho todo menos el release (pedido del usuario: un solo release con Linux y macOS).
- **Aceptación:** la app instalada desde el `.dmg` en el Mac del usuario crea un proyecto, lo
  compila con XeLaTeX (MacTeX), muestra el PDF con SyncTeX y pega una captura; el CI de Linux
  y el de macOS en verde.

---

## 9c. Plan Windows (línea Windows, pedido del usuario tras la línea macOS)

Mismas reglas que los otros planes (sección 8 para «terminado», sección 7 para git): una rama
por fase (`win-N-nombre`, desde `main` al día), un commit + push por ítem, PR a `main` con el CI
verde al cerrar cada fase. Al terminar la fase W3, la siguiente versión menor libre (**1.2.0**
si macOS ya publicó la 1.1.0; mira los tags) en `package.json`, `Cargo.toml`,
`tauri.conf.json` y el `pkgver` del PKGBUILD, y su tag; el release, solo con confirmación del
usuario. La verificación manual es con `pnpm tauri dev` en Windows.

**Lo que la línea macOS ya dejó hecho y sirve de modelo** (revisa su historia en el
**Estado actual** con prefijo «macOS:» y los PR #15–#17): `src-tauri/src/platform/`
(`clipboard.rs`, `fonts.rs`, `menu.rs`, `trash.rs`, `on_main_thread`), `lib/platform.ts`
(`IS_MAC`, `keyLabel`: los atajos se escriben con `Mod`, que es Ctrl en Linux y Windows),
`tex/detect.rs` con `FALLBACK_DIRS` por sistema, el backend `officialReadOnly`, `appDirs` en
Ajustes → Rutas, la carga de pdf.js *legacy* solo donde faltan APIs (`supportsModernPdfjs`;
WebView2 es Chromium actual: debería usar la moderna) y el job de CI de macOS (`ci.yml`).

Lo que hoy depende de Unix o no tiene camino para Windows (revisado al preparar esta línea;
confírmalo con `grep -rnE 'cfg\((not\()?(target_os|unix|windows)' src-tauri/src` y compilando):

| Dónde | Qué pasa en Windows |
|---|---|
| `tex/process.rs` | `process_group` y `kill_group` (`killpg`) son solo Unix: en Windows **cancelar no mata nada** (`kill_group` vacío). Hace falta un *Job Object* (crate `windows-sys`) que contenga a latexmk y sus hijos, o `taskkill /T /F /PID` |
| Todo `Command::new` (`tex/*`, `backup/remote.rs`, `history`, `settings`…) | Un programa de consola lanzado desde una app gráfica **abre una ventana negra** cada vez: `creation_flags(CREATE_NO_WINDOW)` (`std::os::windows::process::CommandExt`) en un solo lugar |
| `tex/detect.rs` (`find_in_path`, `is_executable`, `FALLBACK_DIRS`) | Busca `latexmk` sin extensión: en Windows son `.exe` (y algunos `.bat`/`.cmd`: probar `PATHEXT`). Rutas de respaldo: `C:\texlive\<año>\bin\windows`, `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64`, `C:\Program Files\MiKTeX\miktex\bin\x64` |
| `tex/backends.rs`, `tex/tlpdb.rs`, `commands/packages.rs` | Sin backend para **MiKTeX** (fuera de alcance en v1, pero es el TeX más común en Windows): detectar, compilar y gestionar paquetes con `miktex packages install`/`mpm` en modo usuario (sin administrador). TeX Live oficial en `C:\texlive` suele ser escribible por el usuario (`tlmgr` funciona) |
| `tex/install_tl.rs` | TeX Live de LibreTeX: hoy `install-tl-unx.tar.gz`; en Windows `install-tl.zip` con `install-tl-windows.bat`, binarios en `bin\windows`. `tar` viene en Windows 10+ (bsdtar, también abre `.zip`); `gpgv` viene con Git for Windows |
| `tex/latexmk.rs`, `tex/synctex.rs` | Rutas con letra de unidad y `\` en los argumentos (`synctex view -i "línea:col:archivo"` con `C:\…` tiene un `:` más); logs con CRLF |
| `util/paths.rs`, `files/mod.rs` | `canonicalize` devuelve `\\?\C:\…` (crate `dunce` o quitarlo), comparación de rutas sin distinguir mayúsculas, nombres reservados (`CON`, `NUL`, `COM1`…) y caracteres prohibidos (`<>:"\|?*`) en `validate_name`; los tests de path traversal y symlinks (hoy `cfg(unix)`) también en Windows |
| `projects/trash.rs` | `trash::os_limited` sí existe en Windows (Papelera de reciclaje): debería compilar tal cual; probar listar/restaurar |
| `platform/clipboard.rs` | Pegar imágenes devuelve `None` fuera de Linux/macOS. Primero comprobar si WebView2 entrega la imagen en el evento `paste` (Chromium suele hacerlo: entonces basta con mandar los bytes a `save_clipboard_image`); si no, leer el portapapeles de Windows desde Rust |
| `platform/fonts.rs` | Fuera de macOS usa `fc-list` (no existe en Windows): DirectWrite, o las monoespaciadas conocidas (Consolas, Cascadia Mono/Code, Courier New, Lucida Console). Agregar Consolas/Cascadia a `--font-mono` en `styles/index.css` |
| `commands/system.rs` | Memoria del equipo: `None` fuera de Linux/macOS (`GlobalMemoryStatusEx`) |
| `main.rs`, `platform/menu.rs` | Lo de WebKitGTK/NVIDIA es solo Linux y el menú propio solo macOS: en Windows no hace falta menú nativo (la app tiene el suyo en la barra) |
| `tauri.conf.json` (`bundle.targets`) | Solo `appimage` (y `tauri.macos.conf.json` en macOS): en Windows `nsis` (instalador por usuario, sin administrador) y/o `msi` en `tauri.windows.conf.json` |
| `state.rs` (`directories`) | Datos en `%APPDATA%\LibreTeX\libretex\config` / `data` y caché en `%LOCALAPPDATA%\LibreTeX\libretex\cache`: ya se ven en Ajustes → Rutas (`appDirs`); README |
| Editor, índice, búsqueda, parser de logs | Archivos con CRLF: CodeMirror los une con `\n` al guardar (decidir si conservar CRLF), y el parser de logs y los índices deben tolerar `\r` |
| `.github/workflows/ci.yml` | Job `windows-latest` (en repos privados un minuto de Windows cuenta 2): en `main` y en las ramas `win-*` |

### Fase W0 — Preparación en Windows
- [x] Verificar entorno (2c): arquitectura y versión de Windows, `cl` (Build Tools), `rustc`/
      `cargo` (toolchain MSVC), `node`, `pnpm`, `git`, `gh auth status`, TeX (`latexmk -v`,
      `xelatex --version`, `synctex help`, `perl -v`). Lo que falte: el comando exacto de
      `winget` para el usuario.
- [x] Rama `win-0-preparacion`; `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` y
      `cargo test`; anotar lo que falle en **Estado actual**.

### Fase W1 — Compila y abre
- [x] `cargo build` compila en Windows (revisar cada `cfg(unix)` / `cfg(target_os)` de la tabla);
      los tests de Rust pasan (los que dependen de Unix, detrás de `cfg(unix)` con su
      equivalente de Windows cuando tenga sentido: rutas, nombres reservados, `\\?\`).
- [x] Procesos: sin ventanas de consola (`CREATE_NO_WINDOW`) y cancelar mata todo el árbol de
      la compilación (Job Object); probado con una compilación larga.
- [x] `pnpm tauri dev` abre la ventana y el inicio; crear, abrir, renombrar y eliminar proyectos
      (Papelera de reciclaje), árbol de archivos con rutas de Windows.
- [x] CI: job `windows-latest` con `cargo test` y `pnpm test`.

### Fase W2 — Funciones con diferencias
- [x] TeX: detectar MiKTeX y TeX Live (con y sin abrir desde el menú Inicio, que no hereda el
      PATH de la terminal); compilar con XeLaTeX y SyncTeX en ambos sentidos con rutas de
      Windows; parser de logs con CRLF.
- [x] Paquetes: backend MiKTeX (instalar/desinstalar en modo usuario y «instalar al vuelo»),
      TeX Live oficial escribible, y el TeX Live de LibreTeX en Windows (instalar con
      `install-tl-windows`, verificar con `gpgv`, compilar con él).
- [x] Pegar imágenes en WebView2; fuentes monoespaciadas y memoria del equipo en Windows.
- [x] Ventanas: varias ventanas y arrastre de pestañas entre ellas, «Mostrar en el Explorador»,
      cerrar la ventana guarda antes; atajos con Ctrl (como Linux) sin chocar con los de Windows.
- [x] Respaldo con Git/GitHub con el `git`/`gh` de Windows (credential manager de Git for
      Windows), historial, exportar ZIP; archivos con CRLF en el editor.
- [x] Visor PDF en WebView2 (pdf.js moderno, `enableHWA` según se vea), MathJax, ortografía,
      CSP; rutas de datos en el README.

### Fase W3 — Distribución
- [x] `pnpm tauri build` produce el instalador (`tauri.windows.conf.json`: NSIS por usuario,
      sin administrador; MSI si el usuario lo quiere); WebView2 ya está en Windows 11.
- [x] Firma de código: opcional (certificado del usuario). Sin firma, SmartScreen avisa la
      primera vez («Más información» → «Ejecutar de todas formas»); explicarlo en el README.
- [ ] README: instalación en Windows; versión, tag y release (con confirmación).
- **Aceptación:** la app instalada con el instalador en el PC del usuario crea un proyecto, lo
  compila con XeLaTeX (MiKTeX o TeX Live), muestra el PDF con SyncTeX, cancela una compilación
  sin dejar procesos ni ventanas de consola y pega una captura; el CI de Linux, macOS y Windows
  en verde.

---

## 10. Cómo trabajar (reglas para Claude Code)

- Al empezar una sesión: lee este archivo, mira el sistema (`uname -s`, sección 0), revisa
  `git status` y `git log -5`, y continúa en el primer ítem sin marcar de tu línea (en macOS,
  el Plan macOS, 9b; en Windows, el Plan Windows, 9c). No te adelantes de fase.
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

- Linux: seguridad de dependencias para la 1.2.1 (alertas de Dependabot al hacer público el
  repositorio; rama `seguridad-dependencias`). `zip` 8.6 → 9 (resuelve 9.4.1): 5 alertas, una
  crítica (encabezados contradictorios) y de denegación de servicio; la de extraer siguiendo
  enlaces no aplicaba (`zip_import` no usa `extract`, valida cada ruta). En la 9, `name()`
  devuelve un `Result` (un nombre que no se decodifica invalida el ZIP) y la biblioteca corta
  la lectura de una entrada mayor que su tamaño declarado con `InvalidData`, que se informa
  como ZIP inválido («tamaño falso o datos dañados»). npm: `pnpm-workspace.yaml` con
  `overrides` (`glob` ^14.0.2, `minimatch` ^11.0.1, `undici` ^8.12.2): llegaban por el menú
  de MathJax (`rimraf`), ESLint y jsdom (tests); ninguno corre en la app. El PR de Dependabot
  (#1) no compilaba por el cambio de `name()`; se cierra en favor de este. Dependabot no puede
  abrir PR de npm: lanza pnpm con `corepack`, que Node 26 ya no trae. Probado: `cargo test`
  (214), clippy, lint, typecheck, `pnpm test` (592) y `pnpm build`. Fusionado (PR #2). Luego:
  `rustls` 0.23.45 → 0.23.46 (`cargo update -p rustls`, vía `ureq`; 4 alertas), probado con
  la descarga y firma reales del instalador de TeX Live (test ignorado
  `firma_real_del_instalador`). `glib` 0.18 (alerta de `VariantStrIter`, que no se usa) no se
  puede subir: la 0.20 es de GTK 4 y Tauri en Linux usa GTK 3.
- Linux: repositorio público (2026-11-07, pedido del usuario). Para no publicar los correos
  personales que tenían 31 commits (las fusiones de PR hechas en GitHub llevaban el correo
  principal de la cuenta; dos commits del Mac, el de la máquina), se creó un repositorio
  nuevo con el historial reescrito (`git filter-branch --env-filter`: autor y committer
  `GASDJUGA` con el correo *noreply*; las fusiones siguen firmadas por GitHub). Mismo
  contenido: comprobado que `main` y los 15 tags tienen exactamente los mismos árboles que
  antes, y ningún objeto contiene esos correos. Cambian todos los hashes (los citados más abajo
  son los viejos). El anterior quedó privado y archivado como `libretex-privado`, con los PR
  #1–#29 y su CI. Releases 1.0.0 y 1.2.0 vueltos a subir con los mismos archivos. Para
  publicarlo: `SECURITY.md`, `CONTRIBUTING.md`, el `PKGBUILD` clona el tag desde GitHub (antes
  desde la copia local, porque el repositorio era privado). Cada clon (Linux, Mac, Windows)
  se vuelve a clonar desde el repositorio nuevo.
- Linux: release 1.2.0 preparado (sin publicar: el usuario lo publicará junto con macOS y
  Windows). Revisado lo que trajeron las líneas macOS y Windows desde `v1.0.0` (lo común: CRLF
  conservado al guardar, `dunce`, `platform::process::command`, backends `officialReadOnly` y
  `Miktex`, `is_writable` probando con un archivo): en Linux pasan `pnpm typecheck`, `lint`,
  `test` (592), `cargo fmt`, `clippy` y `cargo test` (214); el CI de `main` en el commit del tag
  está verde en sus cuatro tareas. Construidos desde el tag `v1.2.0` (`main` = tag):
  `src-tauri/target/release/bundle/appimage/LibreTeX_1.2.0_amd64.AppImage` (114 MiB, SHA-256
  `2a6750af…6e6bd977`) y `packaging/arch/libretex-1.2.0-1-x86_64.pkg.tar.zst` (12 MB,
  `makepkg -f --nodeps`, SHA-256 `a14fa2e9…6d8b30`); los dos abren el inicio con «v1.2.0» en
  Xvfb con un HOME vacío. Notas del release en `docs/releases/1.2.0.md` (las tres
  plataformas, con el parpadeo de WebKitGTK 2.54 como problema conocido). Falta: el `.dmg`
  (el de la M3 es 1.1.0) y el instalador de Windows construidos desde `v1.2.0` en sus
  máquinas. **Publicado el 2026-11-07** (https://github.com/GASDJUGA/libretex/releases/tag/v1.2.0,
  confirmado por el usuario) con los cuatro archivos: AppImage, paquete de Arch,
  `LibreTeX_1.2.0_aarch64.dmg` y `LibreTeX_1.2.0_x64-setup.exe`; notas con «Novedades
  respecto de 1.0.0» y `CHANGELOG.md` nuevo (1.2.0 y 1.0.0). Antes: el borrador del release (creado desde Linux el 2026-11-07, con el
  AppImage y el paquete de Arch y las notas de `docs/releases/1.2.0.md`): en macOS y Windows
  no se crea otro, se construye desde el tag (`git checkout v1.2.0`, `pnpm tauri build`) y se
  sube con `gh release upload v1.2.0 <archivo>` (`LibreTeX_1.2.0_aarch64.dmg`,
  `LibreTeX_1.2.0_x64-setup.exe`); publicarlo (`gh release edit v1.2.0 --draft=false`) solo
  con confirmación del usuario.
- Pendiente para la línea Windows (hallado en la revisión del release 1.2.0, sin arreglar: hay
  que probarlo en Windows). `backends::tex_path` antepone al PATH los `bin` de
  `C:\texlive\<año>` (`official_texlive`), y `detect::fallback_dirs` agrega
  `C:\Strawberry\perl\bin` al final. En Windows cualquier usuario sin administrador puede
  crear carpetas en la raíz de `C:\`: otro usuario del mismo PC podría crear
  `C:\texlive\2099\bin\windows\latexmk.exe` y LibreTeX lo ejecutaría al compilar, con los
  permisos de quien la usa y antes que MiKTeX. Arreglo propuesto: aceptar esas carpetas solo si
  su dueño es Administradores/SYSTEM/TrustedInstaller o el usuario actual y nadie más puede
  escribir en ellas (`GetNamedSecurityInfoW`, dueño y DACL); si no, ignorarlas. En Linux y
  macOS no aplica (`/usr/local/texlive` es de root). Confirmado en el PC del usuario por la
  línea Windows: en `C:\` los «Usuarios autentificados» pueden crear carpetas y quien la crea
  modifica lo de adentro. Para la 1.2.1.
- Windows: W3, firma, README y versión. Sin firma de código (el usuario no tiene
  certificado): el README explica el aviso de SmartScreen («Más información» → «Ejecutar de
  todas formas», solo con el instalador bajado de internet). README: «Instalación en Windows»
  (instalador por usuario, desinstalar desde Configuración, MiKTeX + Strawberry Perl o el TeX
  Live de LibreTeX, git y gh con winget), Windows 11 x64 en Plataformas y los requisitos de
  desarrollo en Windows. Versión **1.2.0** en `package.json`, `Cargo.toml`,
  `tauri.conf.json` y el `pkgver` del PKGBUILD. Falta: PR de la W3 con CI verde, tag
  `v1.2.0` en `main` y, desde él, el instalador de Windows (y los paquetes de Linux y macOS
  en sus máquinas) para el release único, que se publica con confirmación del usuario.
- Windows: Fase W3 en curso (rama `win-3-distribucion`), ítem del instalador.
  `tauri.windows.conf.json` (Tauri lo junta solo en Windows): target `nsis`, instalación
  por usuario (`installMode: currentUser`: `RequestExecutionLevel user`, manifiesto
  `asInvoker`, sin ventana de administrador) en `%LOCALAPPDATA%\LibreTeX`, en español (en
  inglés si Windows lo está). WebView2 ya viene en Windows 11 (si faltara, el instalador baja
  su instalador oficial). Sin MSI: un MSI es por equipo y pide administrador. `pnpm tauri
  build` (5 min) → `src-tauri/target/release/bundle/nsis/LibreTeX_<versión>_x64-setup.exe`
  (10 MiB, con las plantillas); la primera vez la CLI de Tauri bajó NSIS 3.11 y su DLL de
  sus releases oficiales, con el hash verificado. El usuario lo instaló y usó la app desde
  el menú Inicio (2026-11-03, «Todo bien»). Ítem completo.
- Windows: Fase W2 cerrada (PR #23 fusionado con CI verde, con `main` al día: la M3 de macOS
  y `v1.1.0`). Release único (decidido por el usuario, 2026-11-03): **1.2.0 para las tres
  plataformas**. El tag `v1.1.0` queda como está (marca el fin de la M3, sin release propio:
  no se mueve un tag ya subido); al cerrar la W3, versión 1.2.0 en `package.json`,
  `Cargo.toml`, `tauri.conf.json` y el `pkgver` del PKGBUILD, tag `v1.2.0` y, desde él, el
  instalador de Windows, el `.dmg` de macOS y el AppImage y el paquete de Arch, publicados
  juntos con confirmación del usuario. Siguiente: Fase W3 (rama `win-3-distribucion`).
- Windows: visor PDF, MathJax, ortografía y CSP (último ítem de la W2). WebView2 156 tiene
  las funciones que pdf.js 6 moderno necesita (`supportsModernPdfjs`: sí). Lienzos en GPU
  también en Windows (`enableHWA: IS_MAC || IS_WINDOWS`): medido con el documento de 100
  páginas del usuario (pantalla 1×, 144 Hz; Ctrl+rueda por CDP, 8 pasos), sin tareas largas
  en ningún caso; entre cuadros ≤ 14 ms con GPU y ≤ 21 ms sin ella, y la capa nítida llega
  ~175 ms tras el último paso (~185 sin GPU). La página 4 (la de «Figura 1.1» que WebKitGTK
  perdía con GPU) sale completa con GPU en 3 recargas; con y sin GPU solo cambia el
  suavizado. La build de producción (`pnpm tauri build --debug --no-bundle`, servida como
  `http://tauri.localhost` con su CSP): PDF dibujado (worker, wasm), vista previa de MathJax
  de `|\vect{F}|\propto\frac{qQ}{d^2}` (macro del usuario), 3 palabras marcadas por la
  ortografía (worker con el diccionario), ninguna violación de CSP ni error en la consola.
  README: rutas de datos de Windows (`%APPDATA%\LibreTeX\libretex\config` y `data`,
  `%LOCALAPPDATA%\LibreTeX\libretex\cache`). Probado por el usuario en la app (2026-11-03,
  «todo bien»). Ítem completo: **Fase W2 completa**. Siguiente: PR de la W2 y Fase W3.
- Windows: respaldo, historial, ZIP y CRLF (ítem de la W2). Archivos con CRLF: `read_text`
  le da al editor el texto con `\n` y `write_text` vuelve a escribir CRLF si el archivo ya
  lo usaba (por su primera línea); los nuevos y los que tenían `\n` quedan con `\n`. Así un
  proyecto clonado con el `core.autocrlf=true` de Git for Windows no cambia entero al
  guardar (el respaldo ve solo lo editado), y vale igual en Linux y macOS. La búsqueda en el
  proyecto lee los archivos como el editor (líneas, contexto y `$` sin `\r`) y reemplazar
  conserva el CRLF. Textos: los comandos para instalar TeX, git y gh van según el sistema
  (`installCommands` de `lib/systemCommands.ts`, que trajo la línea macOS: Windows tiene ahí
  su variante con winget, sin administrador); sin TeX,
  la ayuda de Paquetes sugiere MiKTeX en Windows; la nota de Ajustes ya no dice
  `~/.config` (remite a Rutas). En este PC: `credential.helper=manager` (Git Credential
  Manager de Git for Windows) y `gh` con la sesión de GASDJUGA. Probado: tests (CRLF al leer,
  escribir, buscar y reemplazar); los de respaldo con `git` real ya corrían en Windows desde
  la W1. Probado por el usuario en la app (2026-11-03: respaldo y GitHub, traer cambios,
  clon con CRLF, historial y ZIP; «Todo bien»). Ítem completo.
- Windows: ventanas (ítem de la W2). Arrastrar no funcionaba en Windows: el manejador de
  archivos soltados de Tauri reemplaza el de WebView2 y deja la página sin arrastrar y soltar
  de HTML5 (reordenar o sacar pestañas, mover en el árbol). Ahora está apagado en Windows
  (`tauri.windows.conf.json` para la principal, `disable_drag_drop_handler` en las demás) y
  la página recibe lo que se suelta desde el Explorador (`lib/windowsDrop.ts`, instalado al
  arrancar: WebView2 ya no abre el archivo ni CodeMirror pega su texto): lo pasa a WebView2
  con `postMessageWithAdditionalObjects` (los `File`, también los de carpetas: WebView2
  entrega vacío un `FileSystemHandle` y nunca resuelve el de una carpeta) y Rust lee sus rutas
  (`platform/webview2.rs`, crates `webview2-com` y `windows-core` del árbol), las guarda como
  el último soltar (lo único que acepta `import_dropped`, como antes) y se las devuelve a la
  ventana. Tauri recibe también ese mensaje y deja un `console.error` inofensivo. Atajos del
  navegador apagados en WebView2 (Ctrl+R/F5 recargaba la app, Ctrl+P, Ctrl+J abría las
  descargas, Ctrl+rueda y el pellizco agrandaban toda la interfaz, deslizar volvía atrás);
  la página sigue recibiendo esas teclas. Los atajos propios excluyen Alt, así que AltGr
  (Ctrl+Alt en Windows, con el que el teclado latinoamericano escribe `{}[]\@`) no los
  dispara. «Mostrar en el Explorador» (`REVEAL_KEY`). De paso: `testTimeout` de 20 s en
  Vitest (en Windows los tests que montan la vista de proyecto pasaban a veces los 5 s con
  toda la suite). Probado: tests (`windowsDrop.test.ts`), clippy y soltar en la app (CDP:
  `Input.dispatchDragEvent` con rutas reales: una carpeta y un archivo copiados al proyecto).
  El usuario probó pestañas, árbol, ventanas y atajos («Todo bien»); soltar desde el
  Explorador no hacía nada (se esperaba el handle, ver arriba); arreglado y confirmado por
  el usuario (2026-11-03, «Todo bien»). Ítem completo.
- Windows: pegar imágenes, fuentes y memoria (ítem de la W2). `platform/clipboard.rs` lee el
  portapapeles de Windows como en Linux y macOS (los bytes no pasan por la webview): primero
  los formatos `PNG` y `JFIF` tal como se copiaron (navegadores, Recortes); si no, el mapa de
  bits (`CF_DIBV5`/`CF_DIB`: Impr Pant y casi todos los programas) convertido a PNG (24 o 32
  bits, de abajo arriba o al revés, máscaras `BI_BITFIELDS`; el cuarto byte en 0 en toda la
  imagen se toma como opaca, y lo opaco se guarda sin alfa). Fuentes: las familias de ancho
  fijo de GDI (`EnumFontFamiliesExW`), sin las de mapa de bits (Terminal, Fixedsys) ni las
  verticales (`@MS Gothic`); `--font-mono` suma Cascadia Mono y Consolas. Memoria:
  `GlobalMemoryStatusEx`. Probado: tests (mapas de bits sintéticos, el portapapeles real con
  un mapa de bits —test ignorado `portapapeles_de_windows`—, Consolas y Courier New entre las
  monoespaciadas, memoria de este PC). Probado por el usuario en la app (2026-11-02:
  Win+Mayús+S, Impr Pant y la fuente en Ajustes, «Todo bien»). Ítem completo.
- Windows: ítem de paquetes de la W2 completo. El usuario probó en la app (2026-11-02):
  la pestaña Paquetes muestra MiKTeX, e instalar y desinstalar un paquete desde la ficha
  funcionan («Todo bien»). Siguiente: pegar imágenes, fuentes y memoria en Windows.
- Windows: ítem de paquetes de la W2, partes TeX Live. Oficial en `C:\texlive`:
  `is_writable` en Windows prueba creando y borrando un archivo (el atributo de solo lectura
  no dice nada de una carpeta; un TeX Live del administrador no es escribible para el
  usuario: test con `System32`); `tlmgr.bat` en `bin\windows` (test con los dos TeX Live).
  TeX Live de LibreTeX en Windows (`install_tl.rs`): `install-tl.zip` con su `.sha512` y
  `.asc`; se descomprime con el `tar` de Windows (`System32\tar.exe`: el de Git for Windows
  es GNU tar y no abre `.zip`); `install-tl` corre con el Perl que trae el instalador
  (`tlpkg\tlperl`, con `PATH` y `PERL5LIB` como `install-tl-windows.bat`, sin su ventana:
  `-no-gui`); perfil con `/` y sin accesos directos ni asociaciones
  (`tlpdbopt_desktop_integration 0`, `tlpdbopt_file_assocs 0`: los nombres `instopt_…` de
  la documentación vieja los rechaza). `gpg`/`gpgv`: los de Git for Windows (`…\Git\usr\bin`,
  hallado desde `git`, que una app sí tiene en el PATH); el llavero se pasa como
  `./texlive.gpg` con el directorio de trabajo en su carpeta (gpg lee `C:` en `C:\…` como
  tipo de llavero). Probado de verdad con el PATH de una app (`System32`, PowerShell —
  install-tl lo usa— y `Git\cmd`): firma real aceptada y rechazada con un byte cambiado, e
  instalación completa en 99 s (139 paquetes del esquema básico + los 13 de base) que
  compila XeLaTeX + babel-spanish solo con ese TeX Live. Asistente: textos de Windows (dónde
  se instala; GnuPG viene con Git for Windows). Quedan con textos de Linux, para sus ítems:
  `noGh` (pacman) del respaldo y la nota de Ajustes (`~/.config`).
- Windows: ítem de paquetes de la W2, parte MiKTeX. Nuevo backend `miktex` (escribible): un
  `kpsewhich` con `miktex` al lado; `Backend.tlmgr` lleva ese `miktex`. `tex/miktex.rs`: el
  catálogo sale de `miktex packages list --template` (8 245 paquetes en ~1 s: id, instalado,
  versión, licencia, título y `runFiles`, de donde salen los `.sty`/`.cls`) convertido a la
  misma estructura del `texlive.tlpdb`, así búsqueda, ficha, «Paquetes instalados» y `.sty`
  faltante → paquete funcionan igual; los programas de MiKTeX (`miktex-*`) no se ofrecen.
  Instalar/desinstalar/actualizar = `miktex packages install|remove|update <id>` (probado a
  mano: 3,9 s y 2,5 s; nombre desconocido → salida 1); «Buscar actualización» =
  `check-update` (~14 s, una línea por paquete, sale con 100 si hay). La instalación al
  vuelo es la de MiKTeX (`[MPM]AutoInstall`; en este PC, 1). Arreglado de paso:
  `detect::output_with_timeout` leía la salida recién al terminar el programa, y uno que
  escribe más de lo que cabe en la tubería (~64 KB; la lista de MiKTeX son 12 MB) quedaba
  esperando hasta el tiempo máximo (test con 1 MB). Interfaz: textos de MiKTeX en el
  selector de distribución, la ayuda del backend y «no está en MiKTeX». Probado: tests
  (lista de MiKTeX real y de muestra, detección con un MiKTeX falso, ficha con MiKTeX).
  Ojo: `tras_instalar_el_sty_faltante_se_fuerza_la_recompilacion` falló una vez con la suite
  completa y no en 5 corridas más (intermitente, probablemente MiKTeX con varios procesos a
  la vez).
- Windows: diagnóstico de la compilación lenta (pedido del usuario). Medido en su PC:
  cada programa de MiKTeX tarda ~190 ms solo en arrancar (carga 135 DLL; un programa vacío
  de Windows, 11 ms; el Perl de Strawberry, 13 ms). Una recompilación pasa por: el
  envoltorio `latexmk.exe` de MiKTeX (que solo lanza Perl: 389 ms contra 164 ms de `perl
  latexmk.pl`), latexmk, que pregunta a `kpsewhich` por cada `.bib` y `.bst` en cada corrida
  (~190 ms cada una; su autor lo da por despreciable), y el motor. Con la plantilla XeLaTeX
  (con bibliografía): 2,0 s → **1,45 s** tras `tex/windows_launch.rs` (Perl ejecuta
  `latexmk.pl` directamente y `$kpsewhich` pasa por `kpsewhich-cache.pl`: una respuesta se
  reusa mientras sus archivos existan, 19–25 ms; caché por proyecto en la carpeta de caché
  de LibreTeX, no en el proyecto). Con el documento real del usuario (99 páginas, 31 TikZ,
  38 tcolorbox, sin `.bib`): ~9,8 s por recompilación, de los que XeLaTeX es 8,25 s (el
  preámbulo solo, 2,4 s con 248 archivos; SyncTeX no cuesta nada), xdvipdfmx 0,55 s y
  latexmk 0,68 s; la optimización ahorra ~0,2 s ahí. La app no suma: medido en WebView2
  (puerto de depuración + protocolo DevTools), `read_pdf` de 447 KB tarda 5 ms y la capa
  nueva reemplaza a la vieja ~60 ms después. Ojo: Perl debe ser nativo (`native_perl`: no
  el de MSYS2/Git for Windows, junto a `msys-2.0.dll`, con el que latexmk escribe rutas
  `/c/…` que bibtex no entiende). Probado: tests (lanzamiento con un MiKTeX falso,
  compilación real con bibliografía dos veces y caché llena, cancelar con Perl directo).
- Windows: Fase W2 en curso (rama `win-2-funciones`), ítem de TeX. Detección: en Windows los
  respaldos del PATH son una función (`detect::fallback_dirs`: MiKTeX de usuario en
  `%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64`, el de todos en `%ProgramFiles%`, y
  Strawberry Perl, que necesita el `latexmk` de MiKTeX) y el TeX Live oficial está en
  `C:\texlive` (`backends::official_texlive`, con `tlmgr.bat`). Probado: los tests de
  compilación real, SyncTeX de ida y vuelta y cancelar pasan con el PATH reducido a
  `C:\Windows\System32` (como una app abierta desde el menú Inicio antes de que la sesión
  viera el TeX). SyncTeX: MiKTeX registra las entradas con la ruta absoluta y nombres largos
  (`GASD_JUGA2`, no `GASD_J~1`); `synctex view` solo las encuentra con esa misma ruta, y es
  la que da la raíz canónica del proyecto (el test usaba la carpeta temporal sin
  canonicalizar). Logs: MiKTeX los escribe con LF y nombra los archivos de la distribución
  como `(C:\Users\…\MiKTeX\tex/latex/base\article.cls`; tres logs reales de MiKTeX 25.12 en
  `tests/fixtures/logs/miktex-*.log` (usuario cambiado por otro del mismo largo) dan los
  mismos errores, avisos y cajas que los de TeX Live, también con CRLF. Sin TeX, el aviso da
  en Windows `winget install --id MiKTeX.MiKTeX -e; winget install --id
  StrawberryPerl.StrawberryPerl -e` (`IS_WINDOWS` en `lib/platform.ts`). Probado por el usuario en
  la app (2026-11-02): XeLaTeX, Ctrl+J, doble clic en el PDF y errores en Registros («Todo
  bien»), aunque nota la compilación lenta (ver abajo).
- macOS: versión 1.2.0 preparada para el release único (sin publicar: lo hace el usuario con
  confirmación). Revisado lo que entró en `main` desde `v1.1.0` (fases W2 y W3 de Windows,
  PR #23 y #25): en macOS no cambia nada visible; las ramas nuevas de la interfaz son para
  Windows (`IS_WINDOWS`, `REVEAL_KEY`) y lo común de Rust (CRLF conservado, salidas grandes de
  programas leídas mientras corren, `is_writable` en Unix igual, instalador del TeX Live de
  LibreTeX lanzado como `perl install-tl`) funciona igual. Probado en el Mac sobre el tag
  `v1.2.0`: `pnpm lint`/`typecheck`/`test` (592), `cargo fmt`/`clippy`/`test` (222), la firma
  real del instalador y una instalación real del TeX Live de LibreTeX que compila (61 s), y la
  build de producción en WKWebView (abrir un proyecto, ⌘↩ compila, 3 páginas, sin violaciones
  de CSP). Ojo con el probador: con la pantalla del Mac apagada su ventana queda «oculta»
  (`document.hidden`), WebKit pausa las animaciones (la entrada `lt-view-in` queda en
  opacidad 0) y pdf.js no dibuja; no es de la app. `.dmg` construido desde el tag:
  `src-tauri/target/release/bundle/dmg/LibreTeX_1.2.0_aarch64.dmg` (10,6 MiB, versión 1.2.0,
  mínimo macOS 13, firma ad hoc válida, `hdiutil verify` correcto, SHA-256
  `5514421a…85a4b79e`); arranca con un HOME vacío y el PATH del Dock. Sin probar por el
  usuario con este `.dmg`. Falta: subirlo al release `v1.2.0` junto con lo de Linux y Windows.
- macOS: Fase M3 fusionada (PR #18, CI verde, con lo de `main` hasta el PR #22) y tag
  `v1.1.0` en ese commit. `.dmg` construido desde el tag:
  `src-tauri/target/release/bundle/dmg/LibreTeX_1.1.0_aarch64.dmg` (10,6 MiB, versión 1.1.0,
  mínimo macOS 13, firma ad hoc válida, imagen verificada con `hdiutil`; SHA-256
  `097b3977…d548938`). **Falta solo el release**, que el usuario quiere único para todas las
  plataformas: desde el tag, en Linux el AppImage y `makepkg` en `packaging/arch` (el PKGBUILD
  clona `v1.1.0`); luego `gh release create v1.1.0 --draft` con los archivos de una máquina,
  `gh release upload v1.1.0 …` desde la otra y publicarlo con su confirmación. Si entra algo
  más en `main` antes, el tag no lo tiene (no se mueve un tag ya subido: sería una 1.1.1 o
  1.2.0). Sin probar por el usuario con este `.dmg`: Ajustes (fuentes con Core Text) y pegar
  una imagen TIFF.
- macOS: rendimiento (pedido del usuario antes de fusionar la M3; sin release). Se midió en
  este Mac lo que solo corre en macOS. Arreglado: (1) la lista de fuentes monoespaciadas usaba
  `NSFontManager`, que solo funciona en el hilo principal y lo bloqueaba 206 ms la primera vez
  (la ventana se congelaba al abrir Ajustes); ahora Core Text (`objc2-core-text`) desde
  cualquier hilo, 10–25 ms, mismas familias (test desde otro hilo). (2) Una imagen pegada que
  llega solo como TIFF (Vista Previa) se convertía a PNG en el hilo principal: ~45 ms con una
  imagen de pantalla Retina; ahora ahí solo se lee el portapapeles (`clipboard::Pasted`) y la
  conversión va aparte. Medido sin cambios que valgan la pena: pdf.js moderno con solo lo que
  le falta a WebKit (`getOrInsert*`, `Math.sumPrecise`) contra el *legacy*: igual (65 páginas
  de XeLaTeX con TikZ: 2,15 s de dibujo y ~180 ms de texto con ambos; solo ~15 ms menos al
  cargarlo una vez), se queda el *legacy*; en WKWebView con la build de producción: primer
  dibujo ~200 ms, abrir el editor ~90 ms, 2 ms por tecla, pellizco y scroll del PDF con
  picos ≤ 61 ms (la ventana de prueba va a 30 cuadros por segundo); detección de TeX
  (7 programas, ~10 ms cada uno), `kpsewhich` ya en una sola llamada, el shim de `git` de
  `/usr/bin` (~10 ms). Visto y sin tocar: CodeMirror avisa «Measure loop restarted» una vez
  al abrir el editor en la build de producción (no en desarrollo); cuesta unos pocos
  milisegundos una vez. Sin probar en la app: pegar con el portapapeles real tras el cambio.
- macOS: el usuario probó el `.dmg` («todo ok») y pidió dos cambios. Antes se mezcló `main`
  (fase W0 de Windows, PR #19): solo chocaban entradas de `CLAUDE.md` y del README, se
  conservaron las dos líneas. (1) «Desde GitHub» no veía la sesión de `gh auth login`: abierta
  desde el Dock, la app recibe `PATH=/usr/bin:/bin:/usr/sbin:/sbin` y `backup::remote::tool`
  solo sumaba `/usr/local/bin` y `/usr/bin`, así que no encontraba el `gh` de Homebrew
  (`/opt/homebrew/bin`) y lo daba por no instalado; con ese mismo entorno, `gh repo list` sí
  responde con la sesión guardada. Ahora `tool` usa `tex::detect::search_path` (los respaldos
  de cada sistema) y git/gh se ejecutan con ese PATH, para que git encuentre el ayudante de
  credenciales de `gh` y `ssh` (test `desde_el_dock_se_ven_las_herramientas_de_homebrew`).
  (2) Sin comandos de Arch en macOS: `lib/systemCommands.ts` (`installCommands`) da los
  comandos para copiar por sistema (Arch: pacman; macOS: `brew install --cask mactex-no-gui`,
  `xcode-select --install`, `brew install gh`) y los textos los reciben como parámetro: aviso de
  «falta TeX» (`tex.installHintMac`), ayuda sin distribución (`backendHelp.noneMac`), git y
  GitHub CLI en el respaldo y en «Desde GitHub»; «con pacman, si es el de Arch» se quitó del
  texto general. Lo demás que nombra pacman solo aparece con el TeX Live de pacman. `.dmg`
  reconstruido y probado por el usuario («funciona»). Para la línea Windows: `installCommands`
  aún le da a Windows los comandos de Arch (no es macOS); falta su variante (winget). Luego se
  mezcló la W1 de Windows (PR #20): solo chocó este archivo. Disco: ~3 GB libres.
- macOS: Fase M3 en curso (rama `mac-3-distribucion`; la M2 se cerró con el PR #17, fusionado
  con CI verde). `src-tauri/tauri.macos.conf.json` (Tauri lo junta solo en macOS): targets
  `app` y `dmg`, firma ad hoc (`signingIdentity: "-"`: el usuario no tiene cuenta de Apple
  Developer; en Apple Silicon una app sin ninguna firma no abre) y macOS 13 como mínimo.
  `pnpm tauri build` → `LibreTeX.app` (15,6 MiB) y `LibreTeX_1.1.0_aarch64.dmg` (10,6 MiB) en
  `src-tauri/target/release/bundle/`; solo Apple Silicon (el universal pide
  `rustup target add x86_64-apple-darwin` y nadie lo pidió). Probado: el `.dmg` montado trae
  la app y el acceso a Aplicaciones; la copia instalada tiene versión 1.1.0, mínimo 13.0,
  plantillas, firma ad hoc válida (`codesign --verify --deep --strict`), Gatekeeper la rechaza
  (lo esperado sin notarizar) y arranca con un HOME de prueba y el PATH mínimo del Dock.
  README: «Instalación en macOS» (arrastrar a Aplicaciones; abrirla la primera vez con «Abrir
  igualmente» en macOS 15, clic derecho → Abrir en 13–14, o `xattr -dr com.apple.quarantine`)
  y requisitos de desarrollo en macOS. Versión 1.1.0 en `package.json`, `Cargo.toml`,
  `tauri.conf.json` y `pkgver` del PKGBUILD. Falta: PR con CI, tag `v1.1.0` y el release (con
  confirmación del usuario), y la aceptación en su Mac. Ojo: el disco del Mac quedó casi lleno
  (1,1 GB libres) y la compilación falló; se borró `src-tauri/target/debug` (9,7 GB, se
  regenera).
- Windows: Fase W1 completa (PR #20). El usuario probó en `pnpm tauri dev` (2026-11-02): sin
  ventanas de consola al abrir, compilar y cancelar; crear, abrir, renombrar y eliminar
  proyectos (Papelera de reciclaje y restaurar desde la Papelera de la app) y el árbol de
  archivos funcionan («Todo bien»). Siguiente: Fase W2.
- Windows: CI (ítem 4 de la W1). Job «Windows (clippy, test, frontend)» en `windows-latest`,
  solo en `main` y en los PR de ramas `win-*`: `pnpm test`, `cargo clippy` y `cargo test`
  (sin TeX en el runner: los tests de compilación real se saltan; los de `git` sí corren).
  Verde en su primera corrida (PR #20, en borrador).
- Windows: procesos (ítem 2 de la W1). `platform/process.rs`: `command()` es la única forma
  de lanzar programas (todos los `Command::new` pasan por ahí) y en Windows lleva
  `CREATE_NO_WINDOW`; las ejecuciones de `tex/process.rs` (latexmk, tlmgr, install-tl, git
  de red) arrancan suspendidas, entran en un *Job Object* propio y recién entonces se
  reanudan (así latexmk no alcanza a lanzar perl o el motor fuera del job; std no da el
  hilo principal, se reanuda por Toolhelp); cancelar = `TerminateJobObject` (registro PID →
  job, quitado al terminar la ejecución). Probado: test que compila un bucle infinito con
  el latexmk de MiKTeX, espera a tener al menos 3 procesos en el job (envoltorio, perl,
  pdflatex), cancela y comprueba con `tasklist` que no queda ninguno (< 5 s).
- Windows: Fase W1 en curso (rama `win-1-compila`). Hecho el primer ítem: `cargo test` pasa
  en Windows (195, más 4 ignorados; clippy y fmt limpios). Cambios: `dunce::canonicalize` en
  vez de `canonicalize` en todo el backend (en Windows, sin `\\?\C:\…`, que latexmk, synctex
  y git no entienden; en Unix es lo mismo); rutas mostradas con `~` y el separador del
  sistema (`util::paths::tilde`, una sola función para el inicio y Ajustes → Rutas:
  `~\LibreTeX\Tesis`); `-outdir=.libretex/build` siempre con `/`; `find_in_path` en Windows
  busca `.exe`/`.com`/`.bat`/`.cmd` y no toma los scripts sin extensión de Git Bash o MSYS2
  (antes no encontraba `git` ni `latexmk`, y los tests que los usan se saltaban);
  `validate_name` en Windows rechaza `CON`/`NUL`/`COM1`… (también con extensión), `<>:"|?*`
  y nombres que terminan en punto o espacio (`windows_problem`, probado en todos los
  sistemas); los tests de enlaces (salir del proyecto, enlaces rotos e internos, árbol sin
  bucles) corren también en Windows con *junctions* (`util::paths::link_dir`; un symlink
  pide el modo de desarrollador). Con `git` y MiKTeX ya encontrados corren de verdad los
  tests de respaldo con `git` y de compilación real con latexmk de MiKTeX (el usuario aceptó
  instalar el paquete `latexmk`). Git for Windows trae `core.autocrlf=true` en su
  configuración del sistema: lo que LibreTeX clona o trae queda con CRLF en el disco (se
  respeta la configuración del usuario; los tests comparan sin los finales de línea; el
  editor con CRLF es de la W2). Sin probar todavía: `pnpm tauri dev` (ítem 3).
- Windows: Fase W0 hecha (PR #19). PC del usuario: Windows 11 Home 25H2
  (build 26200), x86_64 (`AMD64`), WebView2 156, Git for Windows 2.56 (con `gpgv` y `tar`),
  `gh` con la sesión de GASDJUGA. Instalado por el usuario con winget (2026-10-30): VS 2022
  Build Tools (carga VCTools), Rust 1.99.1 (`stable-x86_64-pc-windows-msvc`), Node 26.12.1,
  pnpm de winget (12.16 global; usa el 11.28.5 de `packageManager`), MiKTeX 25.12 de usuario
  (`%LOCALAPPDATA%\Programs\MiKTeX\miktex\bin\x64`: XeTeX 4.16, pdfTeX, LuaHBTeX, `synctex`
  1.5) y Strawberry Perl 5.42. **`latexmk` de MiKTeX pendiente:** `latexmk.exe` es un
  envoltorio y el primer uso abre el diálogo «Package Installation» de MiKTeX (instalación al
  vuelo) para bajar el script: hay que aceptarlo. Resultados: `pnpm install`, `pnpm lint`,
  `pnpm typecheck` y `pnpm test` (88 archivos, 570 tests) pasan sin cambios. `cargo test`
  **compila** en Windows (una advertencia: `Duration`/`Instant` sin usar en
  `tex/latexmk.rs:199`) y pasan 181; fallan 6, todos por suponer Unix: rutas con `/` en lo
  que se muestra (`~/LibreTeX\Tesis` en `ops.rs` ×2, `-outdir=.libretex\build` en
  `latexmk.rs`), rutas absolutas de Unix en los tests (`/home/x/Proyectos` en `settings.rs`,
  `/usr/share/texmf-dist/…` en `tlmgr.rs`) y `backup::conectar_valida_la_direccion` (`push`
  no da `Forbidden`). Son del primer ítem de la W1. Ojo: la app de Claude se abrió antes de
  las instalaciones, así que sus shells tienen el PATH viejo (anteponer `~/.cargo/bin`,
  `C:\Program Files\nodejs`, la carpeta de pnpm de winget y la de MiKTeX).
- macOS: arreglos tras la prueba del usuario de la M2 (no se pasa de fase todavía: lo pidió).
  (1) La revisión ortográfica no subrayaba nada en macOS: la palabra sí quedaba marcada
  (`.cm-spell-error`), pero el WebKit de macOS 15 no acepta el atajo `text-decoration:
  underline wavy <color>` (solo la línea) y descartaba la regla entera; ahora van las
  propiedades separadas. Comprobado en WKWebView: línea ondulada roja bajo «magíster» (que el
  diccionario `dictionary-es` no trae: se puede agregar al diccionario personal). (2) El
  pellizco y los clics en el PDF a veces tardaban: con lienzos por CPU y pantalla 2× el hilo
  principal se congelaba al dibujar páginas nuevas (al recompilar a 160 %: 154–242 ms por
  vez; cada paso de alejar, hasta 146 ms). En macOS el visor usa ahora lienzos en GPU
  (`enableHWA: IS_MAC`): ≤ 56 ms al recompilar y ≤ 62 ms al alejar; las páginas con TikZ de
  XeLaTeX salen idénticas con y sin GPU en 4 recargas (el error de WebKitGTK no aparece en
  WKWebView); Linux sigue sin GPU. Los pasos del pellizco se juntan en uno por cuadro. Saltar
  desde el índice del PDF (82 páginas, hyperref) o desde el esquema del editor no se congeló
  en las pruebas (24–48 ms): con el visor sin congelarse debería responder también; falta que
  el usuario lo confirme. Medido con `scripts/macos/wkprobe.swift` (su ventana va a 30 cuadros
  por segundo en reposo: cuentan los picos).
- macOS: rutas de datos (último ítem de la M2). `get_settings` devuelve también `appDirs`
  (configuración, datos y caché, con `~`) y Ajustes → Rutas los muestra. En macOS (crate
  `directories`) son `~/Library/Application Support/org.LibreTeX.libretex` (configuración y
  datos juntos) y `~/Library/Caches/org.LibreTeX.libretex`. README: sección «Dónde guarda
  LibreTeX sus archivos» (Linux y macOS) y nota de ⌘ en los atajos. Probado: test de `tilde`
  y la sección en WKWebView con el backend simulado. Fase M2 completa.
- macOS: ventanas (ítem de la M2). Menú propio de macOS (`platform/menu.rs`) en el idioma de la
  interfaz (se rehace al cambiarlo): LibreTeX (Acerca de, Servicios, Ocultar…, Salir), Edición
  (sin él la webview no recibe ⌘C/⌘V/⌘X/⌘Z/⌘A) y Ventana. «Salir» (⌘Q) ya no es el
  `terminate:` del menú de Tauri, que cerraba sin dejar guardar: cierra cada ventana visible
  como su botón (cada una guarda antes; la app termina con la última; un segundo ⌘Q fuerza).
  Salir desde el Dock o al cerrar sesión sigue siendo inmediato (tao no deja frenarlo): se
  pierde a lo sumo el último segundo sin autoguardar. Cerrar la última ventana termina la app
  (como ya pasaba; ver Decisiones). «Mostrar en Finder» en vez de «Mostrar en el gestor de
  archivos». La barra de título es la normal de macOS. Probado: compila, clippy, tests y la
  `.app` de depuración arranca con el menú (HOME de prueba). Sin probar en la interfaz: el
  menú a la vista, ⌘Q con texto recién escrito y el arrastre de pestañas entre ventanas
  (WKWebView); quedan para la prueba del usuario.
- macOS: visor PDF, MathJax y ortografía en WKWebView (ítem de la M2). El WebKit de macOS 15.4
  no tiene `Map.prototype.getOrInsertComputed` ni `Math.sumPrecise`, que usa pdf.js 6 (en la
  página y en el worker: `getPage` fallaba con «getOrInsertComputed is not a function»).
  `pdfController.ts` carga la versión *legacy* de pdf.js (misma API, con polyfills; su propio
  worker) solo donde faltan (`supportsModernPdfjs`): WebKitGTK 2.52 sigue con la moderna.
  Buscar en el PDF fallaba también con la legacy («Unable to get text content»): pdf.js recorre
  un `ReadableStream` con `for await`, que WebKit no trae antes de Safari 26;
  `lib/pdf/streamIterator.ts` lo agrega solo si falta. Pellizco del trackpad: WebKit manda
  `gesturestart/change/end` (no Ctrl+rueda): `PdfPane` los convierte en `zoomBy` alrededor del
  punto. «de 3» ya no se parte en dos líneas. Probado con `scripts/macos/wkprobe.swift`
  (WKWebView propio, sin controlar la pantalla): el `PdfController` real con el PDF de ejemplo
  (dibujo, zoom con rueda rápido, buscar «vectores» → 2, ir a la página 3, doble clic → punto
  SyncTeX, ninguna página visible en blanco), MathJax (`aligned` con `\ihat`, `\ell`,
  `\mathbb`) y el worker de ortografía (es: «ecuasión» → «ecuación», 0,7 s); y la build de
  producción servida como `tauri://localhost` con la CSP de la app: abrir un proyecto del
  backend simulado, ⌘↩ compila (Ctrl+↩ no), PDF dibujado, pellizco 38 % → 76 %, sin
  violaciones de CSP. SyncTeX con el `synctex` de MacTeX: el test de ida y vuelta de Rust pasa.
  Falta: verlo en la app real (trackpad real, `enableHWA` sigue apagado) y la prueba del
  usuario. Ojo: un test de `FileTree` falló una vez con la suite completa y pasa solo (3/3).
- macOS: fuentes y memoria (ítem de la M2). `platform/fonts.rs`: en Linux `fc-list` como antes
  (salió de `settings.rs`); en macOS las de ancho fijo de `NSFontManager`
  (`availableFontNamesWithTraits`) llevadas a su familia con `NSFont`, en el hilo principal
  (`platform::on_main_thread`, que ahora usa también el portapapeles). En este Mac: Andale Mono,
  Courier New, Menlo, Monaco y PT Mono (comprobado forzando el hilo en una prueba temporal; un
  test de libtest no corre en el hilo principal). Memoria: `NSProcessInfo.physicalMemory`
  (test `esta_maquina_tiene_memoria` también en macOS). La pila por defecto ya tenía
  `ui-monospace` (SF Mono en WebKit).
- macOS: atajos con ⌘ (ítem de la M2). `lib/platform.ts`: `IS_MAC` (`navigator.platform`) y
  `keyLabel`, que escribe un atajo como se lee (`Mod` = Ctrl en Linux, ⌘ en macOS; en macOS los
  modificadores van como símbolos en su orden: `Mod+Shift+S` → `⇧⌘S`). `lib/shortcuts.ts`:
  `isMod` es Ctrl (o Super, como antes) en Linux y ⌘ sin Ctrl en macOS, donde Ctrl+letra es del
  texto (Ctrl+B, Ctrl+J…); cambiar de pestaña sigue con Ctrl+Tab (⌘Tab es del sistema) y además
  ⇧⌘] / ⇧⌘[ como en Safari. Los textos con «Ctrl+…» (menús, barra, tooltips, avisos, Ajustes y
  la lista de Atajos, que admite teclas propias de macOS: rehacer solo ⇧⌘Z, completar también
  ⌥`) pasan por `keyLabel`. Pegar imágenes quedó marcado: hecho y probado por el usuario en la M1.
  Probado: tests (`platform.test.ts`, atajos con `mac`); falta verlo en la app del Mac.
- macOS: Fase M2 en curso (rama `mac-2-funciones`). Hecho el ítem de TeX: MacTeX se encuentra
  también abierto desde el Dock (`tex_path` antepone `/usr/local/texlive/<año>/bin/*`, y en
  macOS los respaldos del PATH son `/Library/TeX/texbin`, `/opt/homebrew/bin`, `/usr/local/bin`
  y `/usr/bin`). Nuevo backend `officialReadOnly` (TeX Live oficial que solo root modifica:
  MacTeX, o uno instalado con sudo en Linux): el catálogo sabe qué tiene instalado por su
  `texlive.tlpdb`, y la ficha y Registros dan `sudo /Library/TeX/texbin/tlmgr install <paquete>`
  para copiar (`lib/packages/installCommand.ts`, componente `InstallCommand`, antes
  `PacmanCommand`). El `kpsewhich` de `/Library/TeX/texbin` es un enlace al TeX Live oficial: se
  resuelve antes de comparar para no listar MacTeX dos veces. TeX Live de LibreTeX en macOS:
  `install-tl-unx` sirve tal cual; `gpg`/`gpgv` se buscan con el PATH con respaldos (Homebrew) y,
  si faltan, el asistente dice «brew install gnupg». Probado: tests (backends con un enlace
  simbólico, ficha con MacTeX, comando), la firma real con el `gpg` de Homebrew y una instalación
  real en una carpeta temporal (45 s) que compila XeLaTeX + babel-spanish (tests ignorados
  `firma_real_del_instalador` e `instalacion_real`). Sin probar en la interfaz (sin acceso al
  escritorio; el usuario pidió seguir sin esperar sus pruebas). Ojo: el test
  `backup::tests::traer_no_pisa_cambios_sin_respaldar` falló una vez en el Mac y no se repitió
  en 7 corridas (intermitente; no se tocó el respaldo).
- macOS: Fase M1 cerrada (rama `mac-1-compila`, PR #16). El repositorio está ahora en
  `~/Developer/libretex` (fuera de iCloud: en `~/Documents` iCloud dejaba archivos del repo y de
  `.git` solo en la nube, una edición vació un archivo y git se colgaba). Compila y `cargo test`
  pasa (206, más los ignorados con la papelera y el portapapeles reales del Mac); clippy y fmt
  limpios. Papelera de la app en macOS: `platform/trash.rs` (ver Decisiones), con tests sobre
  una papelera falsa. Tests que suponían Linux: la carpeta temporal de macOS está bajo el enlace
  `/var` → `/private/var` (el `home_dir` del fixture de `ops.rs` ahora es canónico) y MacTeX en
  `/usr/local/texlive` entra primero en el PATH (`backends.rs`). Los arreglos de WebKitGTK de
  `main.rs` y `parse_meminfo` quedan sin usar fuera de Linux (`allow(dead_code)`; la memoria en
  macOS es de la M2). CI: job «Rust en macOS» (clippy y test) solo en `main` y en PR de ramas
  `mac-*` (no corre `pnpm test`: jsdom no depende del sistema). El usuario probó en la app:
  Cmd+C/V/X/Z/A, pegar una captura y la Papelera (enviar y restaurar) funcionan; «Eliminar
  definitivamente» la dejaba a la vista en la Papelera de Finder. Comprobado que el elemento sí
  se borra del disco (también desde una app propia abierta con `open`, como LibreTeX), así que
  ahora se le avisa a Finder con `NSWorkspace.noteFileSystemChanged` al eliminar y al restaurar;
  el usuario pidió pasar de fase sin esperar su prueba (si sigue, se arregla después). Claude no
  tuvo acceso al escritorio (los pedidos volvieron rechazados). Para probar con control del
  escritorio hace falta un `.app` (el binario de `tauri dev` no tiene bundle id):
  `pnpm tauri build --debug --bundles app` → `src-tauri/target/debug/bundle/macos/LibreTeX.app`.
  **Visor PDF roto en macOS 15.4:** el JavaScriptCore de Safari 18.4 no tiene
  `Map.prototype.getOrInsertComputed`, `getOrInsert` ni `Math.sumPrecise`, que pdf.js 6 usa
  (`PDFFindController` falla al crear el visor). El build `legacy` de pdf.js trae los
  polyfills; es del ítem «Visor PDF en WKWebView» de la M2.
  Adelantado de la M2 a pedido del usuario (pegar una captura no funcionaba): pegar imágenes en
  macOS. `platform/clipboard.rs` lee `NSPasteboard` (PNG o JPEG tal cual; TIFF, como lo que se
  copia de Vista Previa, convertido a PNG con `NSBitmapImageRep`); probado con el portapapeles
  real (test ignorado `portapapeles_de_macos`). Y en la página, una imagen copiada de un
  navegador (trae `text/html` sin `text/plain`) ya no se toma por texto (`editor/pasteImage.ts`).
  Probado por el usuario en la app.
- macOS: Fase M0 hecha (PR #15).
  Mac del usuario: Apple Silicon (`arm64`), macOS 15.4.1, Xcode Command Line Tools, Homebrew
  7.0, `gh` con la sesión de GASDJUGA. Instalado por el usuario (2026-10-26): Rust 1.99.1 con
  rustup.rs (`~/.cargo/bin`), Node 26.12.1, pnpm 11.28.5 y gnupg 2.5.24 (`gpgv`) de Homebrew.
  **MacTeX pendiente:** `brew install --cask mactex-no-gui` bajó el `.pkg` (6,9 GB en el
  Caskroom) y quedó registrado, pero no lo instaló (no hay `/usr/local/texlive` ni recibo en
  `pkgutil`); hay que repetirlo con `brew reinstall --cask mactex-no-gui` (pide la contraseña
  de administrador). Resultados: `pnpm install`, `pnpm lint`, `pnpm typecheck` y `pnpm test`
  (85 archivos, 558 tests) pasan sin cambios. `cargo build --tests` falla solo con lo
  previsto: `trash::os_limited` no existe en macOS (`projects/trash.rs`, 4 usos: `list`,
  `restore_all`, `purge_all`), así que `cargo test` no corre todavía. El resto de los `cfg`
  de Linux (`main.rs`, `platform/clipboard.rs`, `commands/system.rs`) ya tiene su rama para
  otros sistemas y `gtk` es dependencia solo de Linux. Ojo: un shell de Bash no interactivo
  puede no tener `~/.cargo/bin` en el PATH (anteponerlo).
- Linux: rama `editor-y-transiciones` (pedidos del usuario tras actualizar Plasma). (1) Tras
  `\\` (salto de línea) no se abre el autocompletado (`editor/lineBreak.ts`: número par de
  barras antes del cursor); `\\\al` sí completa. (2) Abrir un proyecto o volver al inicio entra
  con una transición breve (`lt-view-in`, 200 ms, como los diálogos). (3) El esquema del archivo
  se pliega: flecha junto a cada título con subsecciones (o ←/→ con el foco en el título),
  «Colapsar todo»/«Expandir todo» en su cabecera; lo plegado se recuerda por proyecto en la
  sesión (`outlineCollapsed`, claves de `headingKeys`: archivo, nivel, título y repetición, no
  la línea) y si el cursor queda dentro de algo plegado se resalta el título que lo contiene.
  (4) Pendiente (queda para después, pedido del usuario): el texto del editor parpadea al
  escribir desde la actualización del 2026-11-01. Es de **WebKitGTK 2.54** (con 2.52.6 de la
  caché de pacman no pasa; Plasma 6.8.2 y nvidia 615.78.08 iguales). Sin GPU
  (`LIBRETEX_SAFE_RENDERER=1`) no parpadea pero va muy lento; no lo arreglan
  `__NV_DISABLE_EXPLICIT_SYNC=0`, `WEBKIT_DISABLE_DMABUF_ATLAS`,
  `WEBKIT_SKIA_GPU_PAINTING_THREADS=0`, `WEBKIT_SKIA_ENABLE_CPU_RENDERING`,
  `WEBKIT_FORCE_VBLANK_TIMER`, `WEBKIT_DMABUF_RENDERER_FORCE_SHM` (con el arreglo de NVIDIA
  puesto) ni `WEBKIT_DISABLE_COMPOSITING_MODE`. Por probar: `WEBKIT_USE_SKIA_FOR_COMPOSITION=0`
  (vuelve al compositor TextureMapper de 2.52; el de Skia es lo nuevo de 2.54) y
  `WEBKIT_DMABUF_RENDERER_FORCE_SHM=1` con `__NV_DISABLE_EXPLICIT_SYNC=0` (lo que usó VoxCtrl
  en la misma combinación). La que sirva se pondrá en `main.rs` como las otras (Linux +
  NVIDIA, sin pisar lo que defina el usuario).
- Linux: arrastrar una pestaña fuera de la ventana no abría una ventana nueva en la sesión
  Wayland del usuario (v1.0.0; en Xvfb/X11 sí). Medido en su sesión con una ventana de prueba
  de WebKitGTK (con su permiso) y la misma lógica: salir de la página se detecta
  (`dragleave` sin `relatedTarget`), pero al soltar en el escritorio u otra app `dragend`
  informa `dropEffect: "move"` (el último que puso la página), no `"none"`, y la app lo tomaba
  por «otra ventana la recibió». Ahora (`lib/windows.ts` `tabDragEnded`): con `"none"` como
  antes; si no, espera 400 ms a que otra ventana de LibreTeX la pida (`give`, `askedFor`) y, si
  nadie la pidió, la abre en una ventana nueva. Probado: tests (fuera de todas las ventanas y
  sobre otra ventana, con «move») y por el usuario en su sesión con la app compilada: Beta fuera
  → ventana nueva; de vuelta sobre la principal → vuelve, sin ventana extra.
- Linux: búsqueda que distingue mayúsculas por defecto (pedido del usuario), en el editor
  (`search({ caseSensitive: true })` en `editor/setup.ts`) y en el proyecto
  (`store/search.ts`); «Aa» lo desactiva. La del PDF sigue ignorando mayúsculas y tildes (no
  tiene la opción). De paso, ESLint ignora lo que `makepkg` deja en `packaging/arch`.
- Linux: **v1.0.0 en `main`** (PR #13 fusionado con CI verde, tag `v1.0.0`). Fases 0–12 cerradas
  (tags `v0.0.0` … `v0.11.0`, `v1.0.0`). Repo privado https://github.com/GASDJUGA/libretex
- Release https://github.com/GASDJUGA/libretex/releases/tag/v1.0.0 con el AppImage y el
  paquete de Arch (confirmado por el usuario). Pendiente: que el usuario instale el paquete
  (`sudo pacman -U …` o `makepkg -si` en `packaging/arch`). Cambios
  posteriores: una rama por cambio o grupo, PR con CI, y versiones 1.0.x (arreglos) / 1.x.0
  (funciones nuevas).
- Versión 1.0.0 (el usuario dio por terminada la fase): versión en `package.json`,
  `Cargo.toml` y `tauri.conf.json`; el parpadeo del zoom quedó aceptado y «PDF en ventana
  aparte» sigue «Próximamente». Construidos desde el tag: `LibreTeX_1.0.0_amd64.AppImage`
  (113 MiB) y `libretex-1.0.0-1-x86_64.pkg.tar.zst` (11 MB, `makepkg -f --nodeps`); ambos
  abren el inicio con «v1.0.0» en Xvfb con un HOME vacío.
- Antes (pedidos del usuario): (1) al abrirse «Pegar imagen» el editor saltaba al inicio
  del archivo. Reproducido solo en su sesión Wayland con GPU (ventana de prueba con su
  permiso: WebKitGTK cargando la vista previa, capturas con Spectacle; en Xvfb y Chromium no
  pasaba): el desplazamiento iba de 3751 a 0. Causa: `Dialog` devolvía el foco al cerrarse
  con un `focus()` normal, y en WebKitGTK eso sobre el área editable de CodeMirror lleva el
  desplazamiento al inicio; en desarrollo pasaba ya al abrir, porque React monta, desmonta y
  vuelve a montar los efectos. Ahora `focus({ preventScroll: true })`; probado en la sesión:
  queda en 3751 al abrir y al cerrar con Esc, con el cursor del navegador donde el de
  CodeMirror. (2) Los diálogos entran con una transición (todos usan `Dialog`): el fondo se
  oscurece en 180 ms y la ventana baja 14 px mientras crece de 97 % a su tamaño y aparece,
  220 ms con salida suave (`lt-dialog-in`, solo `transform`/`opacity`); con «reducir
  animaciones» del sistema, solo se desvanece. Capturado a mitad de la animación en Wayland.
  (3) También al salir (pedido del usuario, por consistencia): quien cierra un diálogo solo
  deja de dibujarlo, así que `Dialog`, al desmontarse (efecto de layout: el elemento sigue en
  la página), deja una copia visual inerte (`lib/leaveAnimation.ts`: `aria-hidden`, `inert`,
  sin `role` ni `id`, con lo escrito en sus campos) que sube 8 px y se desvanece en 160 ms y se
  quita al terminar (600 ms máx.). Si el elemento sigue en la página (React lo vuelve a montar
  en desarrollo) no se crea; donde no hay animaciones (jsdom) tampoco. Probado en la sesión
  Wayland: ninguna copia al abrir, salida con Esc animada y la copia ya no está a los 400 ms.
- Antes: pegar imágenes (pedido del usuario: sacar una captura y pegarla). WebKitGTK
  2.52 no da imágenes a la página: el evento `paste` llega sin datos (probado en Xvfb con una
  imagen real del portapapeles de GTK; con texto sí trae `text/plain`) y `navigator.clipboard
  .read()` responde `NotAllowedError`. Así que Ctrl+V sin texto (`editor/pasteImage.ts`) le
  pide a Rust la imagen: `platform/clipboard.rs` la lee con el portapapeles de GTK en el hilo
  principal (PNG o JPEG tal como se copiaron; otros formatos se convierten a PNG) y
  `read_clipboard_image` la guarda en `AppState.pasted_images` por ventana (los bytes nunca
  pasan por la webview). El diálogo «Pegar imagen» (`PasteImageDialog`, `store/pasteImage.ts`)
  sugiere `captura-AAAA-MM-DD-HHMMSS` y muestra el nombre seguro para LaTeX
  (`lib/imageName.ts`: sin tildes, espacios ni puntos; «Diagrama espín» → `diagrama-espin`);
  `save_clipboard_image` (`files/images.rs`) comprueba la firma PNG/JPEG, el nombre, 50 MB
  máx., la carpeta (`ensure_user_folder`: ni `.libretex/` ni `.git/`) y nunca sobrescribe (el
  aviso queda en el diálogo para cambiar el nombre). Se inserta la figura completa (`imageSpec`
  en `editor/figure.ts`: ruta, `\label{fig:<nombre>}`, cursor en `\caption{}`, `graphicx` si
  falta; en la línea siguiente si la del cursor tiene texto; solo `\includegraphics` dentro de
  una figura). Carpeta: `figuresDir` en `project.json` (raíz por defecto), elegida entre las
  carpetas del proyecto en el menú del proyecto → «Carpeta de imágenes pegadas…»
  (`FiguresFolderDialog`; `update_project_meta` la valida). Los proyectos en blanco traen
  `graphicx` (las plantillas ya lo tenían; Beamer lo carga solo; test que recorre las
  plantillas). `itemize`/`enumerate` traen su primer `\item` por cualquier camino
  (`editor/listItem.ts`: filtro de transacción tras el `\end{…}` recién insertado). De paso:
  escribir a mano el `}` de `\begin{nombre` dejaba una llave de más (`\end{itemize}}`: el
  paquete de LaTeX agregaba otra además de la del cierre automático); ahora `beginOnCloseBrace`
  la reemplaza. Probado: tests (Rust: guardar, nombres, carpeta; vitest: pegar → diálogo →
  archivo en el árbol → figura, nombre repetido, carpeta elegida, `\item` por lista y a mano)
  y la app compilada en Xvfb con una imagen real en el portapapeles de GTK: diálogo, archivo
  PNG válido, figura en la línea siguiente, carpeta `img/` guardada en `project.json`, compila
  con pdfLaTeX con las dos imágenes; pegar texto sigue igual; `enumerate` a mano e `itemize`
  de la lista con su `\item`. Falta probarlo con Spectacle en la sesión Wayland del usuario.
- Antes: zoom out rápido (video del usuario, PDF de 105 páginas). Cuadro a cuadro: en un
  solo paso (≈ 49 % → 24 %) sobre la página 99, bajo el puntero quedaba una ~4 páginas antes
  (el indicador pasó de 99 a 95). Causa: el zoom visual (`lib/pdf/zoom.ts` `axisTranslate`)
  calculaba hasta dónde puede bajar la vista escalando también los márgenes y bordes entre
  páginas (30 px cada una, que no cambian con el zoom): en un documento largo, al alejar, el
  final quedaba cientos de px más arriba que el real y la vista se detenía antes; un paso
  siguiente tomaba esa página equivocada como la del puntero y la capa nueva la conservaba.
  Ahora el eje vertical recibe `fixedTotal` (márgenes de todas las páginas). Probado: test que
  falla sin el arreglo (la página quedaba 346 px más abajo) y la app compilada en Xvfb con un PDF
  de 105 páginas y rueda real (Ctrl + 25 muescas en 0,1 s sobre la página 99): antes, durante el
  zoom visual se veía el final de la 98 bajo el puntero y luego saltaba a la 99; ahora la 99 no
  se mueve. El «tope del scroll en documentos cortos» de la Fase 12 era probablemente lo mismo.
  Pendiente que el usuario lo confirme.
- Antes: auditoría (pedido del usuario). Seguridad: un proyecto ajeno (ZIP, clon,
  carpeta) podía ejecutar programas al compilar: (1) `shellEscape: true` en su
  `.libretex/project.json`, (2) un archivo principal como `-pdflatex=<programa>` (latexmk lo
  toma como opción), (3) su `.latexmkrc` (Perl que latexmk ejecuta). Ahora: confianza por
  proyecto en `projects.json` (fuera del proyecto; los creados en LibreTeX y sus copias sí,
  los importados/clonados/abiertos no); sin confianza se compila sin shell escape y con
  `-norc` + `-r` de los archivos del sistema y del usuario (`latexmk::outside_rc_files`), y
  `TrustWarning` avisa con «Confiar en este proyecto…» (comando `trust_project`). El archivo
  principal se valida (`check_main_file`). ZIP: no se extraen `.libretex/` ni `.git/` (su
  config puede nombrar programas, `core.fsmonitor`) y nunca más bytes de los declarados.
  Rendimiento: un solo worker de pdf.js para todos los documentos (medido ~1 s → ~30 ms al
  abrir cada PDF). Instalador de TeX Live: antes de ejecutarlo, el `.sha512` del mismo
  espejo debe estar firmado por la clave de TeX Live (huella fijada
  C78B82D8C79512F79CC0D7C80D5E5D9106BAB6BC; la clave se baja de tug.org, `gpg --dearmor` +
  `gpgv` del sistema en una carpeta propia) y coincidir con el archivo (crate `sha2`, ya
  estaba como dependencia transitiva). Probado contra los archivos reales (test ignorado
  `firma_real_del_instalador`): aceptado, y rechazado con un byte cambiado. Autoguardado:
  cada guardado disparaba el vigilante, que releía el árbol entero e indexaba todos los
  `.tex`/`.bib` (~25 ms en Rust y ~400 KB a la interfaz en un proyecto sintético de 200
  capítulos). Ahora el evento dice qué rutas ya no existen (`removed`) y el árbol solo se
  relee si algo aparece o desaparece; el índice guarda lo de cada archivo por tamaño y fecha
  (`files::index::build_since`, solo relee lo cambiado) y tiene una versión: si no cambió, no
  se envía (`project_index(id, known)`) y la interfaz no se actualiza. Probado en la app
  compilada (Xvfb, HOME temporal): un proyecto abierto desde una carpeta con un `.latexmkrc`
  que crea un archivo testigo compila sin ejecutarlo y avisa; «Confiar y recompilar» lo marca
  de confianza en `projects.json`, el testigo aparece (también en el árbol) y el PDF se
  dibuja en ambas compilaciones con el worker compartido.
- Antes (pedidos del usuario): (1) al volver a una pestaña se veía «Abriendo
  proyecto…»: la vista esperaba la respuesta de `open_project` (registra el proyecto como
  reciente, escribe `projects.json`) aunque todo el proyecto ya estaba en memoria. Ahora la
  pestaña se activa antes de pintar (`useLayoutEffect` en `app/Project.tsx`) con el resumen
  del proyecto que ya se conoce, y el backend responde después. Medido en la app (Xvfb): la
  pestaña anterior queda en pantalla ~0,2 s y aparece la nueva completa, con el PDF dibujado.
  (2) PDFs de las pestañas en el fondo según la memoria (el usuario: que en un equipo con más
  memoria se mantengan más): en vez de 4 fijos, los usados más recientemente mientras sus
  lienzos dibujados (4 bytes por píxel) y el doble del archivo quepan en el 5 % de la memoria
  del equipo (comando `total_memory`, `/proc/meminfo`; 512 MB si no se sabe); el último que
  se dejó se conserva siempre. Los demás se vuelven a leer al volver, en su lugar. El texto, el
  deshacer y lo demás de cada pestaña ya se conservaban siempre (ocupan poco). (3) Una página
  del PDF quedó en blanco al cambiar de pestaña (no se reprodujo): al volver, `reattach`
  revisa las páginas visibles y dibuja las que pdf.js haya soltado fuera de la página; un zoom
  pendiente al irse se termina al volver en vez de prepararse sin nada visible. Probado:
  zoom y cambio de pestaña inmediato, 3 veces; al volver, todas las páginas dibujadas.
- Antes (pedidos del usuario): (1) el paréntesis pareja del cursor se marcaba con un
  marco que, junto al cursor, parecía otro cursor; ahora es un tinte suave con una línea abajo
  (`editor/theme.ts`; el fondo verde azulado de CodeMirror con el editor enfocado tapaba el
  nuestro). (2) Pegar de una fórmula a un entorno nuevo: el cursor se veía al final de lo
  pegado, pero lo escrito entraba al inicio. No se reprodujo en WebKitGTK (Xvfb, teclas y
  portapapeles reales: equation, `\[ \]`, `$`, varias líneas, con el mouse, teclado latam con
  `^` muerta). CodeMirror reescribe el cursor del navegador tras redibujar el texto que lo rodea
  solo en Chrome y en iOS (el navegador puede informar un lugar y escribir en otro); en
  WebKitGTK confía en lo que este informa. `editor/pasteCursor.ts` lo reescribe siempre tras
  pegar. Pendiente que el usuario lo confirme.
- Antes (pedidos del usuario): (1) el PDF ya no se vuelve a leer ni dibujar al cambiar
  de pestaña: `components/pdf/pdfPool.ts` guarda el visor de cada proyecto (su elemento y su
  `PdfController`, con las páginas dibujadas) mientras otra pestaña está en pantalla; al
  volver se reinserta antes de pintarse (`useLayoutEffect`) y recupera su desplazamiento
  (`detach`/`reattach`: fuera de la página un elemento lo pierde). Solo se recarga si una
  compilación produjo un PDF nuevo mientras tanto (`loadedRun`). Se guardan los 4 usados más
  recientemente; cerrar la pestaña lo descarta. Medido en la app (Xvfb): al volver, el PDF ya
  está dibujado en su página a los 120 ms. (2) Volver al mismo lugar del código: la sesión se
  relee del almacenamiento salvo cambios pendientes (con varias ventanas, una usaba su copia
  vieja y podía pisar la más nueva), se guarda el desplazamiento dentro de la primera línea
  (`topOffset`: en párrafos largos volvía al comienzo del párrafo), el desplazamiento se
  reaplica si el editor cambia de tamaño mientras se restaura y la sesión se escribe al
  cerrar una ventana. En la app no se reprodujo un caso de pérdida total; el usuario debe
  confirmar.
- Antes: varias ventanas más rápidas (el usuario: «se siente un poco lenta»). Medido en
  la app compilada (Xvfb, arrastres reales de GTK, marcas de tiempo temporales): mover una
  pestaña a una ventana ya abierta tardaba ~36 ms, pero arrastrarla fuera ~1,3 s hasta ver el
  editor, porque la ventana nueva arranca la app entera (proceso de WebKit, JavaScript,
  ajustes, proyectos) y, mientras tanto, compite con la de origen por el hilo principal (la
  de origen tardaba ~1 s en mostrar su pestaña siguiente). Ahora: al empezar a arrastrar una
  pestaña o abrir su menú se prepara una ventana oculta con la app ya cargada
  (`prepare_window`, una a la vez, no aparece en «Mover a la ventana de…»); al soltar, se
  muestra y abre el proyecto (`use_spare`; el proyecto le llega por pedido y también como
  pendiente por si aún arrancaba: la ventana escucha antes de pedir su inicio). La ventana
  nueva se pide antes de que la de origen pase a su pestaña siguiente (guardando antes). Si
  solo queda la oculta, se cierra y la app termina. El foco recarga ajustes y proyectos una
  vez por cambio de ventana (llegaban 3 eventos). Resultado medido: editor en la ventana nueva
  103 ms después de soltar (antes ~1300) y la de origen en su pestaña siguiente en 24 ms
  (antes ~1000).
- Antes: varias ventanas (pedido del usuario: arrastrar una pestaña fuera, como en
  Chrome, para ver dos proyectos a la vez). Cada ventana es su propia copia de la app (sus
  stores); Rust coordina. `windows.rs`: registro de qué proyectos tiene cada ventana (un
  proyecto en una sola), etiquetas `main` y `w-1`, `w-2`…, proyecto pendiente de una ventana
  nueva; `commands/windows.rs`: `window_start`, `set_window_projects` (cada ventana informa sus
  pestañas), `claim_project` (si otra ventana ya lo tiene, esa pasa al frente mostrándolo y
  aquí no se abre), `open_project_window` (ventana nueva con el proyecto, 1280×800),
  `request_project`/`give_project` (soltar una pestaña de otra ventana: la dueña guarda,
  cierra la pestaña y la entrega), `other_windows`, `set_window_title` («Proyecto —
  LibreTeX» según la pestaña) y `close_window`. Cerrar una ventana primero le pide guardar
  (`window-close-requested`; un segundo cierre en 5 s la cierra igual); al destruirse libera
  sus proyectos y su vigilante (ahora uno por ventana). Eventos globales con la ventana destino
  (`to`) en el contenido; cada ventana ignora los ajenos. Capacidad para `main` y `w-*`.
  Frontend: `lib/windows.ts` (arranque de la ventana, informe de pestañas, pedidos entre
  ventanas, soltar pestañas en cualquier parte de la ventana, al volver a la ventana relee
  ajustes y proyectos), `TabStrip` (arrastrar con `application/x-libretex-tab`; soltada fuera de
  toda ventana → ventana nueva; menú contextual «Mover a una ventana nueva», «Mover a la
  ventana de …», «Cerrar pestaña»); solo la ventana principal recuerda sus pestañas entre
  sesiones. Probado: tests (Rust del registro; vitest con un backend de varias ventanas) y la
  app real compilada en Xvfb con XTest (arrastre real de GTK): pestaña fuera → ventana nueva
  con ese proyecto; pestaña de la ventana nueva soltada sobre la principal → pasa allí;
  abrir desde la otra ventana un proyecto ya abierto → trae al frente la que lo tiene;
  escribir y cerrar a los 0,15 s → guardado; títulos por pestaña. En Wayland el compositor
  decide dónde aparece la ventana nueva.
- Antes (pedidos del usuario): (1) dentro de los argumentos de algo recién completado
  (`\braket{|}{}`), `\tilde` quedaba sin llaves. Causa: con campos de snippet activos, el
  keymap de snippets de CodeMirror (precedencia máxima) se quedaba con Tab y saltaba al campo
  siguiente aunque hubiera una sugerencia abierta o un comando a medio escribir. Ahora un solo
  Tab (`editor/mathTab.ts` `smartTab`, también como Tab del facet `snippetKeymap`): acepta la
  sugerencia abierta; en matemáticas completa el comando que se está escribiendo; si no, va al
  campo siguiente; y si no hay campos (CodeMirror pierde los de afuera al anidar un snippet),
  sale del grupo en el que está el cursor (`}`, `]`, `\right)`) y entra al argumento
  siguiente (`\frac{a|}{b}` → `\frac{a}{|b}`), también fuera de matemáticas. Al inicio de la
  línea sigue indentando. (2) `editor/leftRight.ts`: escribir o completar el delimitador de
  `\left` (`(`, `[`, `\{`, `|`, `\|`, `.`, `\langle`, `\lvert`, `\lfloor`, `\lceil`…) agrega
  `\right` con el que cierra, con el cursor entre ambos (filtro de transacción: un solo paso de
  deshacer; si closeBrackets ya había puesto `)`, ese se convierte en `\right)`; no duplica un
  `\right` que ya está); también `\bigl(` → `\bigr)` y sus tamaños. Probado con tests (fallan
  con el Tab anterior) y en la vista previa con teclado:
  `$\braket{\tilde{x}}{\left(y\right)z}` escrito con Tab.
- Antes: zoom out rápido del PDF (el usuario: «salta de página y parpadea»). Medido en
  WebKitGTK (Xvfb, PDF de 80 páginas, `PdfController` real y eventos de rueda reales de GTK:
  30 pasos en 0,5 s, rachas espaciadas y acercar): la página bajo el puntero se mantiene (±3 px
  al cambiar de capa), pero al alejar 1–2 páginas que entraban a la vista quedaban en blanco
  ~600 ms (pdf.js elige qué dibujar sin ver la transformación del zoom visual) y otras ~40 ms
  justo tras el cambio de capa (se esperaba solo la página del puntero). Ahora: mientras dura
  el zoom visual, `_getVisiblePages` de cada visor mira lo que realmente está en pantalla
  (`lib/pdf/zoom.ts` `visibleArea`) y `update()` las dibuja (en blanco ≤ 100 ms), y el cambio
  de capa (zoom y recompilar) espera a que estén dibujadas todas las páginas visibles
  (`whenAllRendered`, máx. 1,5 s): ninguna en blanco al cambiar. De paso: con páginas más
  anchas que el panel, «ir a la página», los resultados de búsqueda y los enlaces no movían
  nada (la capa de texto de pdf.js sobresalía 9 px de la página y pdf.js desplazaba
  `.pdfViewer` en vez de la capa): `.page { overflow: clip }`. Lo visual con la GPU queda para
  que lo confirme el usuario.
- Antes (pedido del usuario: menos clon de Overleaf y más temas). Se quitó el botón del
  logo de la barra del proyecto (la pestaña Inicio hace lo mismo). Recompilar es un botón
  cuadrado con el ícono de *play* (girando mientras compila; bajo el puntero se vuelve
  «detener»; el estado se anuncia con una región `aria-live`), con su desplegable de opciones al
  lado. Historial y Diseño pasaron al riel, entre Buscar y Paquetes; el menú de Diseño se abre
  al costado del botón (`menuPosition` con `"right"`) y comparte las opciones con el menú Ver
  (`layout/useLayoutEntries.ts`). Temas de la interfaz: `uiTheme` en `settings.json` (Rust
  `UiTheme`, validado como los demás) con Índigo (por defecto, el de siempre), Grafito, Bosque,
  Océano y Claro; `data-ui-theme` en `<html>` cambia los tokens del cromo (`styles/index.css`,
  nuevo `--lt-tabstrip` para la franja de pestañas que tenía un color fijo); el editor conserva
  su tema claro/oscuro. Ajustes → Interfaz los muestra como muestras de color (grupo de
  radios). `test/tokens.test.ts` comprueba el contraste AA de cada tema. Capturas del README
  regeneradas. Probado en la vista previa (riel, menú de Diseño, historial, temas Claro y
  Bosque) y con tests.
- Antes (pedidos del usuario): (1) comandos de cualquier paquete cargado. Rust
  `tex/definitions.rs` lee los `.sty` de los paquetes del preámbulo (los del proyecto primero,
  luego `kpsewhich` desde la carpeta del proyecto) y los que estos cargan (`\RequirePackage`,
  `\input` de `.tex`; no los `.def`, que son codificaciones: el `puenc.def` de hyperref traía
  miles de símbolos), hasta 300 archivos, con caché por archivo y fecha. Extrae nombres
  públicos (sin `@`, `_`, `:`, ni `\if…`) de `\newcommand`/`\DeclareRobustCommand`/xparse/`\def`/
  `\let`/`\DeclareMathSymbol`/`\DeclareMathAlphabet`… con su número de argumentos obligatorios,
  y entornos (`\newenvironment`, xparse, `\newtcolorbox`, `\newtcbtheorem` → `x` y `x*`,
  `\newtheorem`, y `\foo` + `\endfoo`). Comando `package_definitions`; con el preámbulo de
  Electromagnética: ~3200 nombres en 1,3 s la primera vez (luego ~0,2 s), `\hslash` (amssymb),
  `\mathbb` (amsfonts), entorno `tcolorbox`. Frontend: `usePreamble` los pide al cambiar la lista de
  paquetes; `packageCommandSource` los suma detrás de la tabla curada (que conserva la forma de
  los argumentos de physics) sin repetir los del lenguaje; en matemáticas suben los de paquetes
  de matemáticas. (2) Entornos propios en `\begin{`: `lib/macros/environments.ts` (mismas formas
  que en Rust, sobre el preámbulo y sus incluidos) y `environmentSource`: se insertan con un campo
  por argumento, el cuerpo y su `\end` (`\begin{ejemplo}{|}{}` … `\end{ejemplo}`). (3) La vista
  previa con `<` desaparecía: MathJax escribe `data-latex="a < b"` sin escapar y el saneador
  (XML) rechazaba el SVG entero; ahora escapa `<`, `>` y `&` sueltos en los atributos. Probado
  con tests (Rust con el TeX real de esta máquina; vitest con el editor) y en la vista previa.
- Zoom out rápido (pedido del usuario: a veces se veía un instante otra página, otras quedaba
  en otra). Con eventos de rueda reales de GTK en WebKitGTK sobre Wayland con la GPU (ventana
  de prueba en la sesión del usuario, con su permiso) y un PDF de 30 páginas, la página bajo el
  puntero se mantiene; Chromium igual. Cambio: la versión en preparación (zoom, recompilar)
  espera *detrás* de la visible en vez de con `visibility: hidden` (WebKitGTK con GPU no pinta
  ni sincroniza el scroll de lo oculto, así que su primer cuadro podía mostrar otra cosa);
  `.lt-pdf-viewer` aísla el apilamiento. El salto que «queda» en documentos cortos es el tope
  del scroll: al 25 % el final del documento no puede subir más y bajo el puntero queda otra
  página (correcto). Pendiente que el usuario confirme lo visual.
- Pegar: no reproducido. Probado en WebKitGTK X11 y en la sesión Wayland del usuario (GPU,
  con su permiso): comando Pegar y Ctrl+V real, copia del mismo editor hacia adelante, atrás
  y sin selección, en texto y matemáticas, varias líneas, sobre selección; captura de la
  ventana: el cursor queda al final. Revisados autoguardado/vigilante (reconcile) y los
  manejadores de entrada. Falta la secuencia exacta del usuario.
- Antes: autocompletado (pedidos del usuario tras probar la fase).
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
| 2026-10-23 | Comandos y entornos de los paquetes leídos de sus `.sty` en Rust (siguiendo sus `\RequirePackage` y `\input` de `.tex`) además de la tabla curada | Pedido del usuario: «todo comando de paquete externo»; una tabla nunca alcanza. La tabla se mantiene porque da la forma de los argumentos que el `.sty` no deja ver (physics define todo con xparse sin argumentos) |
| 2026-10-23 | Los entornos del preámbulo se extraen en el frontend (búferes vivos, sin guardar) y los de paquetes en Rust, con las mismas formas | El preámbulo cambia mientras se escribe; los `.sty` están en disco y pueden ser miles de líneas |
| 2026-10-23 | Sin logo en la barra del proyecto; Recompilar solo con ícono; Historial y Diseño en el riel | Pedido del usuario: el logo repetía la pestaña Inicio y la disposición de la derecha era la de Overleaf |
| 2026-10-23 | Temas de la interfaz como juegos de tokens bajo `data-ui-theme` (el editor mantiene su propio claro/oscuro) | Los componentes ya usan solo tokens; cada tema pasa el mismo test de contraste. Separar interfaz y editor permite, por ejemplo, interfaz clara con editor oscuro |
| 2026-10-23 | Durante el zoom visual pdf.js dibuja las páginas que la transformación deja a la vista (a la escala anterior) y el cambio de capa espera todas las páginas visibles | Las páginas en blanco eran el parpadeo del zoom out; dibujar a la escala vieja también deja lista la lista de operaciones de cada página para la capa nueva |
| 2026-10-24 | Un solo Tab para sugerencias, campos de snippet y salir de grupos; reemplaza el Tab del keymap de snippets de CodeMirror | Su Tab tenía la precedencia máxima y ganaba a la sugerencia abierta; salir del grupo por la llave de cierre funciona aunque CodeMirror pierda los campos externos al anidar snippets |
| 2026-10-24 | `\left<delim>` agrega su `\right` con un filtro de transacción (no un manejador de teclas) | Cubre lo escrito y lo aceptado de la lista (`\langle`), y se combina con el cierre automático de `(`/`[`/`{` en un solo paso de deshacer |
| 2026-10-24 | Varias ventanas = una webview por ventana con sus propios stores; Rust lleva el registro de proyectos por ventana y pasa los pedidos; un proyecto en una sola ventana | Sin compartir stores entre ventanas (sería reescribirlos); un proyecto en dos ventanas tendría dos editores escribiendo los mismos archivos |
| 2026-10-24 | Pestaña soltada fuera de toda ventana → ventana nueva (HTML5 drag con un tipo propio; «fuera» = salió de la página y nadie aceptó la suelta) | En Wayland no hay posición global del puntero; el arrastre de GTK entre ventanas sí funciona y se probó con la app real |
| 2026-10-24 | Solo la ventana principal recuerda sus pestañas entre sesiones | Restaurar varias ventanas necesitaría guardar su disposición, que en Wayland decide el compositor |
| 2026-10-24 | Cerrar cualquier ventana guarda antes los archivos (pedido a la ventana, 3 s máx.; un segundo cierre fuerza) | Antes, cerrar justo después de escribir podía perder lo del último segundo (autoguardado a 1 s) |
| 2026-10-24 | Ventana de reserva oculta, preparada al empezar a arrastrar una pestaña o abrir su menú | Arrancar una webview con la app tarda ~1 s; preparada durante el arrastre, mostrarla tarda ~0,1 s. Solo cuando hay intención (no siempre, cuesta un proceso de WebKit) y una a la vez |
| 2026-10-24 | Tras pegar, el cursor del navegador se vuelve a poner donde está el de CodeMirror | En WebKitGTK lo escrito tras pegar podía entrar al inicio de lo pegado; CodeMirror hace esta corrección solo en Chrome/iOS. Escribirlo de nuevo en el mismo lugar no cambia nada si ya estaba bien |
| 2026-10-24 | El visor PDF de cada proyecto se conserva fuera de la página al cambiar de pestaña (~~hasta 4~~ dentro del 5 % de la memoria del equipo, ver abajo) | Pedido del usuario; volver a leer y dibujar el PDF en cada cambio de pestaña era lo más lento del cambio. El elemento sale del DOM (sin capas ocultas superpuestas) y se guarda su desplazamiento |
| 2026-10-24 | PDFs en el fondo: presupuesto del 5 % de la memoria del equipo, medido por los lienzos dibujados de cada visor | Pedido del usuario: más pestañas en el fondo con más memoria. Los lienzos son casi toda la memoria de un visor y se pueden medir sin APIs de memoria (WebKit no tiene `performance.memory`) |
| 2026-10-24 | Volver a una pestaña la muestra con el resumen del proyecto ya conocido, sin esperar a `open_project` | Todo el proyecto ya estaba en memoria; esperar al backend mostraba «Abriendo proyecto…» en cada cambio |
| 2026-10-24 | Confianza por proyecto (fuera del proyecto) para shell escape y `.latexmkrc`; sin ella, `-norc` + los rc del sistema y del usuario | Un ZIP, un clon o una carpeta ajena podían ejecutar programas al compilar. Como la confianza de espacios de trabajo de VS Code: lo creado en LibreTeX es de confianza |
| 2026-10-24 | El instalador de TeX Live se verifica con la firma de TeX Live (huella fijada) y `gpgv` del sistema; crate `sha2` | El redirector de CTAN elige espejos de terceros; antes se ejecutaba lo que llegara por HTTPS |
| 2026-10-24 | ~~Índice recargado entero con cada cambio de `.tex`/`.bib` del vigilante~~: índice por archivo con versión, y el árbol solo se relee si algo aparece o desaparece | Cada autoguardado releía e indexaba todo el proyecto y lo mandaba a la interfaz |
| 2026-10-25 | Imágenes pegadas leídas del portapapeles de GTK en Rust (crate `gtk` 0.18, el mismo que ya trae Tauri en Linux) y guardadas allí; la webview solo manda el nombre | WebKitGTK no entrega imágenes en el evento `paste` ni por `navigator.clipboard`; así tampoco viajan megas por el IPC |
| 2026-10-25 | Carpeta de imágenes pegadas por proyecto (`figuresDir` en `project.json`, raíz por defecto), elegida entre las carpetas existentes | Pedido del usuario; elegir entre las existentes evita rutas escritas a mano y se valida igual en Rust |
| 2026-10-26 | Los diálogos devuelven el foco con `preventScroll` y entran con una transición breve (fondo que se oscurece, ventana que baja unos píxeles y crece) | Un `focus()` normal sobre el editor lo llevaba al inicio en WebKitGTK. La transición, pedida por el usuario, es corta y propia (no el deslizamiento largo de Overleaf). La salida la hace una copia inerte, así el cierre no espera y ningún lugar que abre diálogos cambia |
| 2026-10-26 | macOS en el mismo repositorio, en su propia línea (chat en el Mac, ramas `mac-*`, Plan 9b), con el sistema detectado al empezar la sesión | Pedido del usuario. Casi todo el código es común; lo de macOS va detrás de `cfg` o en `platform/`, y cada arreglo llega a las dos versiones sin copiarlo |
| 2026-10-30 | Windows en el mismo repositorio, en su propia línea (chat en Windows 11, ramas `win-*`, Plan 9c), como macOS; LF fijado con `.gitattributes` | Pedido del usuario. Reusa lo que la línea macOS ya generalizó (`platform/`, `lib/platform.ts`); con `core.autocrlf` de Git for Windows, Prettier y los fixtures fallarían |
| 2026-10-26 | Buscar en el editor y en el proyecto distingue mayúsculas por defecto | Pedido del usuario; «Aa» sigue para desactivarlo. El PDF no cambia (busca texto extraído, con ligaduras y tildes que no siempre coinciden) |
| 2026-10-31 | Pestaña soltada fuera: si `dropEffect` no es `"none"`, se espera a que otra ventana la pida (400 ms) antes de abrir una nueva | WebKitGTK en Wayland informa `"move"` aunque nadie haya tomado la pestaña; el pedido de la ventana que la recibe es la señal fiable |
| 2026-10-26 | macOS: pnpm de Homebrew en vez de `corepack enable` | Node 26 ya no trae corepack; pnpm 11 descarga y usa solo la versión de `packageManager` (11.28.5) |
| 2026-10-27 | Papelera en macOS con `NSFileManager` (`trashItemAtURL`) y una lista propia de dónde quedó cada elemento (`trash-locations.json` en la carpeta de datos); restaurar = mover de vuelta, eliminar = borrar ese elemento. Crate `objc2-foundation` 0.3 (ya estaba en el árbol por `trash` y Tauri) | En macOS el crate `trash` no lista ni restaura (`os_limited` no existe) y por defecto borra pidiéndole a Finder por AppleScript (permiso para controlar Finder). `~/.Trash` no se puede listar sin «Acceso total al disco», pero un elemento cuya ruta se conoce sí se puede mover. Lo enviado desde LibreTeX se ve en la Papelera de Finder pero sin «Devolver» |
| 2026-10-27 | Imágenes pegadas en macOS leídas de `NSPasteboard` en Rust (crate `objc2-app-kit` 0.3, ya en el árbol por Tauri), como en Linux | Mantiene un solo camino (los bytes no pasan por la webview) y convierte a PNG lo que llega solo como TIFF |
| 2026-10-27 | Al pegar, cuenta como texto solo `text/plain` o `text/uri-list` (lo que pega CodeMirror) | Una imagen copiada de un navegador trae `text/html`: antes se tomaba por texto y no se pegaba nada |
| 2026-10-27 | Backend `officialReadOnly` para el TeX Live oficial que solo root modifica (MacTeX), con `sudo tlmgr install` para copiar; el catálogo usa su `texlive.tlpdb` | Antes caía en el `readOnly` genérico, que no sabe qué está instalado ni cómo instalar. Como con pacman, LibreTeX nunca ejecuta sudo; vale también para un TeX Live de root en Linux |
| 2026-10-27 | Respaldos del PATH por plataforma (`/Library/TeX/texbin`, `/opt/homebrew/bin` en macOS) y también para buscar `gpg` | Una app abierta desde el Dock recibe solo `/usr/bin:/bin:/usr/sbin:/sbin` |
| 2026-10-27 | macOS: atajos con ⌘ (no Ctrl) y textos con símbolos; Ctrl+Tab para las pestañas | Ctrl+letra en macOS mueve el cursor en los campos de texto (como Emacs) y ⌘Tab cambia de app. Los manejadores aceptaban Ctrl o ⌘ en todas partes; en Linux no cambia nada |
| 2026-10-27 | pdf.js *legacy* donde faltan las APIs que usa la versión moderna (detectado, no por sistema) | El WebKit de macOS 15 no puede correr pdf.js 6 moderno; detectar las funciones deja la moderna en WebKitGTK y en un macOS futuro que las tenga |
| 2026-10-27 | Polyfill propio de `ReadableStream[Symbol.asyncIterator]` | Lo usa la búsqueda de pdf.js y ni la versión legacy lo trae; son ~15 líneas sin dependencias |
| 2026-10-27 | Pruebas del frontend en macOS con un WKWebView propio (`scripts/macos/wkprobe.swift`) | Mismo motor que la app, sin permisos de control de pantalla; sirve la build como `tauri://` con la CSP de la app |
| 2026-10-27 | macOS: menú propio con «Salir» que cierra las ventanas con guardado; cerrar la última ventana termina la app | El ⌘Q del menú de Tauri termina sin avisar a las ventanas. Mantener la app viva sin ventanas pediría reabrir la principal desde el Dock (`RunEvent::Reopen`) con todo su arranque; las apps de una ventana de macOS (Ajustes del Sistema, Calculadora) también terminan |
| 2026-10-27 | Lienzos del PDF en GPU solo en macOS (`enableHWA: IS_MAC`); en Linux sigue la decisión del 2026-10-12 | En WKWebView las páginas con TikZ salen iguales con GPU, y por CPU a 2× el hilo principal se congelaba hasta ~240 ms al dibujar (pellizco y clics tardaban) |
| 2026-10-30 | macOS: firma ad hoc, sin notarizar; solo Apple Silicon; macOS 13 como mínimo | Sin cuenta de Apple Developer no hay identidad para firmar ni notarizar; la firma ad hoc basta para que abra en Apple Silicon tras «Abrir igualmente». Solo se prueba en macOS 15 (arm64): el mínimo 13 deja fuera sistemas cuyo WebKit no se probó |
| 2026-11-02 | Lo plegado del esquema se guarda en la sesión del proyecto (`localStorage`), por título y no por línea | Es estado de la vista como el cursor y las pestañas; las líneas cambian al escribir y el título no |
| 2026-10-30 | Windows: TeX de prueba = MiKTeX de usuario + Strawberry Perl; pnpm de winget | MiKTeX instala paquetes sin administrador y es el TeX más común en Windows; el TeX Live de LibreTeX se probará en la W2. Node 26 no trae corepack |
| 2026-11-02 | Comandos de instalación para copiar, por sistema, en un solo lugar (`lib/systemCommands.ts`) | En macOS se mostraban comandos de pacman; con la línea Windows en curso, cada sistema agrega los suyos ahí sin tocar los textos |
| 2026-11-02 | macOS: fuentes del editor con Core Text en vez de `NSFontManager`; crates `objc2-core-text` y `objc2-core-foundation` (ya en el árbol por Tauri) | `NSFontManager` solo funciona en el hilo principal y su primera consulta lo bloqueaba ~200 ms; Core Text es seguro desde cualquier hilo y da las mismas familias |
| 2026-11-02 | macOS: la imagen pegada se lee en el hilo principal y se convierte (TIFF → PNG) fuera de él | La conversión de una imagen de pantalla Retina tardaba ~45 ms con la ventana congelada; leer el portapapeles sigue en el hilo principal, como pide AppKit |
| 2026-11-02 | macOS: se queda pdf.js *legacy* (no el moderno con polyfills propios) | Medido en WKWebView: dibujar y extraer texto tarda lo mismo con ambos; el *legacy* trae los polyfills exactos (`Math.sumPrecise`) sin código propio que mantener |
| 2026-10-31 | Crate `dunce` (ya estaba en el árbol por Tauri) para canonicalizar rutas | En Windows `canonicalize` da `\\?\C:\…`, que muchos programas no aceptan; `dunce` da la ruta normal cuando se puede y en Unix es `std::fs::canonicalize` |
| 2026-10-31 | Windows: rutas mostradas con `\` (`~\LibreTeX\Tesis`); las que viajan a la interfaz como rutas de proyecto siguen con `/` | Lo que se muestra es lo que el usuario ve en el Explorador; las rutas relativas del proyecto son claves internas comunes a todos los sistemas |
| 2026-10-31 | Nombres que Windows no acepta (`CON`, `a:b`, `final.`) se rechazan solo en Windows | En Linux y macOS son válidos y el usuario podría estar usándolos; en Windows crear el archivo fallaría con un error poco claro |
| 2026-10-31 | En Windows solo son programas los `.exe`, `.com`, `.bat` y `.cmd` (en ese orden) | Es lo que `Command` puede lanzar; Git for Windows y MSYS2 traen scripts sin extensión con el mismo nombre (`latexmk`, `synctex`) |
| 2026-10-31 | El `git` del sistema usa la configuración del usuario, también `core.autocrlf` | Es lo que hace cualquier otra herramienta en Windows; el repositorio guarda LF igual |
| 2026-10-31 | Windows: crate `windows-sys` 0.61 (ya en el árbol por Tauri); cada ejecución en un Job Object, creada suspendida y reanudada al entrar en él | Equivale al grupo de procesos de Unix: cancelar termina latexmk, perl y el motor. `taskkill /T` depende de la cadena de padres en el momento de matar; el job no. Sin `KILL_ON_JOB_CLOSE`: lo que un programa deje corriendo a propósito al terminar (un ayudante de credenciales) no se mata |
| 2026-11-02 | Windows con MiKTeX: latexmk se lanza con Perl sobre `latexmk.pl` (no con el `latexmk.exe` de MiKTeX) y sus consultas a `kpsewhich` pasan por un caché en Perl (`-e $kpsewhich=…`) | Cada programa de MiKTeX tarda ~190 ms en arrancar: el envoltorio y cada `.bib`/`.bst` costaban ~0,2 s por recompilación. Si falta algo (Perl nativo, el script, rutas con `%` o `"`), se usa latexmk como antes |
| 2026-11-02 | Windows: imágenes pegadas leídas del portapapeles en Rust (`windows-sys`), con los mapas de bits convertidos a PNG con el crate `png` 0.18 (ya en el árbol por la compilación de Tauri); fuentes con GDI | Mismo camino que Linux y macOS (los bytes no pasan por la webview). Una captura llega casi siempre como mapa de bits, que LaTeX no incluye. GDI da el ancho fijo de cada familia sin COM (DirectWrite) |
| 2026-11-02 | Windows: sin el manejador de soltar archivos de Tauri; lo soltado desde el Explorador llega a Rust como objetos de WebView2 (`postMessageWithAdditionalObjects`) con su ruta; crates `webview2-com` 0.39 y `windows-core` 0.62 (ya en el árbol) | Con el manejador de Tauri no hay arrastrar y soltar de HTML5 en Windows (pestañas, árbol). Así se conserva `import_dropped` con las rutas que el usuario soltó; la página no puede fabricar esos objetos con rutas arbitrarias |
| 2026-11-02 | Windows: atajos del navegador de WebView2 apagados (`AreBrowserAcceleratorKeysEnabled`, zoom, pellizco, deslizar) | Recargar con Ctrl+R/F5 reiniciaba la app y Ctrl+rueda agrandaba toda la interfaz; las teclas siguen llegando a la página |
| 2026-11-03 | Los archivos con CRLF conservan sus finales de línea: el editor los ve con `\n` y al guardar se vuelve a escribir CRLF si el archivo lo usaba | Con `core.autocrlf=true` (Git for Windows) los clones quedan con CRLF; guardar con `\n` cambiaba el archivo entero. Se resuelve en Rust, sin que la interfaz ni las comparaciones con el disco vean el `\r` |
| 2026-11-03 | Windows: lienzos del PDF en GPU (`enableHWA` también en Windows) | En WebView2 la página con TikZ que WebKitGTK perdía sale completa con GPU, y el zoom queda algo más suave (≤ 14 ms entre cuadros contra ≤ 21 ms) |
| 2026-11-03 | Un solo release, 1.2.0, para Linux, macOS y Windows; `v1.1.0` queda como tag sin release | Pedido del usuario (un release con todas las plataformas). `v1.1.0` ya estaba subido en un commit sin Windows y moverlo obligaría a reconstruir lo hecho desde él (el `.dmg`, el PKGBUILD que clona el tag) |
| 2026-11-07 | Cada release con notas de cambios: `docs/releases/<versión>.md` (las del release de GitHub) y `CHANGELOG.md` con todas las versiones | Pedido del usuario: ver qué trae cada versión respecto de la anterior; el archivo del repo queda aunque cambie el release y lo pueden completar las tres líneas |
| 2026-11-07 | Repositorio público nuevo con el historial reescrito (autores con el correo *noreply*); el privado queda archivado | Pedido del usuario. Reescribir el privado y forzar la subida no bastaba: GitHub conserva los commits viejos en las referencias de los PR. Se pierden en el público los PR y el historial del CI, que siguen en el archivado |
| 2026-11-07 | Arreglos de dependencias transitivas de npm con `overrides` en `pnpm-workspace.yaml` | Dependabot no puede abrir esos PR (usa `corepack`, que Node 26 no trae) y las versiones con el arreglo son de una versión mayor más nueva que la que piden sus dependientes; pnpm 11 lee los ajustes de ese archivo |
| 2026-10-08 | Identidad git local del repo: `GASDJUGA` + correo noreply de GitHub | No había identidad git global; evita exponer el correo personal |
