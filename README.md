# JuTeX

_Just a TeX editor._ Editor de LaTeX de escritorio con una experiencia similar a Overleaf, pero **100 % local**:
los proyectos viven en tu disco, se compilan con la distribución TeX de tu máquina y no hay
servidores, cuentas ni telemetría. Solo el gestor de paquetes y el respaldo en GitHub usan
internet, y únicamente cuando tú lo pides.

Antes se llamaba LibreTeX; se cambió porque ya existe otro editor con ese nombre. Si vienes
de LibreTeX, mira [Pasar de LibreTeX a JuTeX](#pasar-de-libretex-a-jutex).

![Vista de proyecto: editor, vista previa de la fórmula y PDF](docs/screenshots/proyecto.png)

## Qué hace

**Proyectos**

- Lista de proyectos con búsqueda y orden; varios proyectos abiertos a la vez en pestañas, y
  en varias ventanas: arrastra una pestaña fuera para verla en otra ventana.
- Crear desde plantillas (artículo XeLaTeX en español, apuntes, tarea, Beamer), abrir una
  carpeta, importar un ZIP (también los de Overleaf) o traer un proyecto desde GitHub.
- Papelera propia (es la del sistema): restaurar o eliminar definitivamente.

**Editor**

- CodeMirror 6 con resaltado, plegado de entornos y secciones, cierre automático de llaves,
  `$` y entornos, comentar con `Ctrl+/` y teclados Vim o Emacs opcionales.
- Autocompletado de comandos y entornos (los de matemáticas primero dentro de una fórmula),
  de tus propios `\newcommand`, de `\ref` y `\cite` del proyecto y de rutas de archivos.
- **Vista previa de matemáticas en vivo** con MathJax, que entiende las macros de tu
  preámbulo.
- Revisión en vivo de llaves, entornos y fórmulas sin cerrar mientras escribes, y revisión
  ortográfica en español e inglés con diccionario personal.
- Buscar y reemplazar en el archivo y en todo el proyecto (texto o expresión regular).
- Recuerda dónde quedaste: archivos abiertos, cursor de cada uno y página del PDF.

**Compilación y PDF**

- `latexmk` con pdfLaTeX, XeLaTeX o LuaLaTeX; siempre manual (`Ctrl+Enter`), con la salida
  en vivo y los errores enlazados a su línea.
- Visor PDF integrado que conserva la página y el zoom al recompilar, con búsqueda y SyncTeX
  en ambos sentidos (`Ctrl+J` y doble clic en el PDF).
- Exportar el PDF (`Ctrl+Shift+S`) o un ZIP de fuentes listo para Overleaf.

**Paquetes**

- Busca en TeX Live y en CTAN, instala, actualiza y desinstala; si al compilar falta un
  `.sty`, ofrece instalar el paquete y recompilar con un clic.
- Si tu TeX Live es el de pacman (solo lectura), te dice qué paquete de pacman instalar.

![Gestor de paquetes en el panel del proyecto](docs/screenshots/paquetes.png)

**Historial y respaldo**

- Historial local automático (cada pocos minutos y tras compilar) y versiones con nombre;
  diferencias por archivo y restaurar un archivo o el proyecto entero.
- Respaldo opcional con el Git del proyecto y, si quieres, en un repositorio privado de
  GitHub: subir, traer cambios y continuar en otra máquina. JuTeX no guarda contraseñas
  ni tokens.

![Historial con las diferencias de una versión](docs/screenshots/historial.png)

![Respaldo con Git conectado a GitHub](docs/screenshots/respaldo.png)

![Inicio con la lista de proyectos](docs/screenshots/inicio.png)

## Plataformas

- **Linux (Arch):** paquete de Arch y AppImage en los
  [releases](https://github.com/GASDJUGA/jutex/releases); también se puede compilar el
  paquete desde el código con `makepkg -si` en `packaging/arch`.
- **macOS 13 o posterior, Apple Silicon:** `.dmg` en los releases (ver
  [Instalación en macOS](#instalación-en-macos)).
- **Windows 11 (x64):** instalador en los releases, sin permisos de administrador (ver
  [Instalación en Windows](#instalación-en-windows)).

## Requisitos (Arch Linux)

```sh
sudo pacman -S --needed webkit2gtk-4.1 git
```

`git` se usa para el respaldo con Git. Para listar tus repositorios de GitHub y crear uno
nuevo desde la app hace falta además GitHub CLI (`sudo pacman -S github-cli` y luego
`gh auth login`).

### Distribución TeX (opcional)

Para compilar hace falta una distribución TeX, pero no es necesario instalarla antes. Hay
dos caminos, y si tienes los dos, eliges cuál usar en **Paquetes** o en **Ajustes**:

- **TeX Live de JuTeX** (sin sudo): en la pestaña **Paquetes**, «Instalar el TeX Live de
  JuTeX». Descarga unos 80 MB desde CTAN, ocupa unos 210 MB en
  `~/.local/share/jutex/texlive` y no toca el sistema. Trae lo necesario para XeLaTeX en
  español; los demás paquetes se instalan, actualizan y desinstalan desde la propia app.
- **TeX Live de pacman**: JuTeX lo usa tal cual. Sus paquetes no se pueden instalar
  desde la app; cuando falta uno, JuTeX te dice qué paquete de pacman lo trae. Un
  conjunto razonable para empezar:

  ```sh
  sudo pacman -S --needed texlive-basic texlive-latex texlive-latexrecommended \
    texlive-latexextra texlive-xetex texlive-langspanish texlive-binextra
  ```

## Instalación en macOS

1. Abre `JuTeX_<versión>_aarch64.dmg` y arrastra **JuTeX** a **Aplicaciones**.
2. La app no está firmada con una cuenta de Apple Developer, así que la primera vez macOS no
   la deja abrir («Apple no pudo verificar…»). Para abrirla igual:
   - **macOS 15 o posterior:** intenta abrirla una vez, cierra el aviso y ve a **Ajustes del
     Sistema → Privacidad y seguridad**; abajo aparece «Se bloqueó el uso de JuTeX»: pulsa
     **Abrir igualmente** y confirma.
   - **macOS 13 y 14:** clic derecho (o Control + clic) sobre JuTeX en Aplicaciones →
     **Abrir** → **Abrir**.
   - Si dice que la app «está dañada», quítale la marca de descarga desde la Terminal:

     ```sh
     xattr -dr com.apple.quarantine /Applications/JuTeX.app
     ```

   Después se abre como cualquier otra app.

Lo demás, igual que en Linux, es opcional:

- **TeX:** [MacTeX](https://tug.org/mactex/) (`brew install --cask mactex-no-gui`, pide la
  contraseña de administrador) o el TeX Live de JuTeX desde la pestaña **Paquetes**, que
  para verificar la descarga necesita GnuPG (`brew install gnupg`). Con MacTeX los paquetes
  se instalan con `sudo tlmgr install …`; JuTeX te da el comando para copiarlo.
- **Respaldo con Git:** `git` viene con las herramientas de línea de comandos de Xcode
  (`xcode-select --install`); para GitHub, `brew install gh` y `gh auth login`.

## Instalación en Windows

1. Ejecuta `JuTeX_<versión>_x64-setup.exe`. Instala JuTeX solo para tu usuario (en
   `%LOCALAPPDATA%\JuTeX`), sin pedir permisos de administrador, y lo deja en el menú
   Inicio. Se desinstala desde **Configuración → Aplicaciones**; tus proyectos y ajustes no
   se borran.
2. El instalador no está firmado con un certificado de firma de código, así que la primera vez
   Windows SmartScreen puede avisar «Windows protegió su PC». Para instalarlo igual: pulsa
   **Más información** → **Ejecutar de todas formas**. Solo pasa con el instalador que se
   descarga de internet, y una vez.

WebView2, el motor que dibuja la interfaz, ya viene en Windows 11. Lo demás es opcional (en
PowerShell; ningún comando pide administrador):

- **TeX:** [MiKTeX](https://miktex.org) para tu usuario, con el Perl que necesita su
  `latexmk`:

  ```powershell
  winget install --id MiKTeX.MiKTeX -e
  winget install --id StrawberryPerl.StrawberryPerl -e
  ```

  JuTeX instala y desinstala los paquetes de MiKTeX desde la pestaña **Paquetes**, y MiKTeX
  puede instalar al compilar lo que falte. O bien, sin instalar nada antes, el TeX Live de
  JuTeX desde la pestaña **Paquetes** (verifica la descarga con el GnuPG que trae Git for
  Windows). Un TeX Live oficial instalado en `C:\texlive` también sirve.

- **Respaldo con Git:** `winget install --id Git.Git -e`; para GitHub,
  `winget install --id GitHub.cli -e` y `gh auth login`.

## Dónde guarda JuTeX sus archivos

Los proyectos viven donde tú los pongas (por defecto, `~/JuTeX`; en Windows,
`%USERPROFILE%\JuTeX`; si ya tenías `~/LibreTeX` de antes, se sigue usando esa); cada uno
guarda sus metadatos, el PDF compilado y el historial en su carpeta oculta `.jutex/`. Lo demás:

| Qué                                               | Linux                  | macOS                                           | Windows                            |
| ------------------------------------------------- | ---------------------- | ----------------------------------------------- | ---------------------------------- |
| Ajustes, lista de proyectos, diccionario personal | `~/.config/jutex`      | `~/Library/Application Support/org.JuTeX.jutex` | `%APPDATA%\JuTeX\jutex\config`     |
| TeX Live de JuTeX, registro de la papelera        | `~/.local/share/jutex` | `~/Library/Application Support/org.JuTeX.jutex` | `%APPDATA%\JuTeX\jutex\data`       |
| Caché (índice de CTAN, catálogo de paquetes)      | `~/.cache/jutex`       | `~/Library/Caches/org.JuTeX.jutex`              | `%LOCALAPPDATA%\JuTeX\jutex\cache` |

También se ven en **Ajustes → Rutas**.

## Pasar de LibreTeX a JuTeX

JuTeX 2.0.0 es la versión siguiente de LibreTeX 1.2.2 con otro nombre. La primera vez que se
abre, mueve solo lo que dejó LibreTeX: ajustes, lista de proyectos, diccionario personal,
el TeX Live de la app, la caché y lo que recordaba la ventana (pestañas, cursor, tamaños de
los paneles). Cada proyecto pasa de `.libretex/` a `.jutex/` (con su historial) la primera
vez que JuTeX lo lee. La carpeta `~/LibreTeX` de tus proyectos queda donde está.

- **Arch Linux:** `sudo pacman -U jutex-<versión>-1-x86_64.pkg.tar.zst` reemplaza al paquete
  `libretex`.
- **AppImage:** borra el `LibreTeX_…AppImage` y usa el de JuTeX.
- **macOS:** arrastra **LibreTeX** de Aplicaciones a la papelera e instala JuTeX desde su
  `.dmg`.
- **Windows:** el instalador de JuTeX no reemplaza al de LibreTeX: desinstala LibreTeX desde
  **Configuración → Aplicaciones** (antes o después; tus datos no se borran) e instala JuTeX.

## Atajos principales

En macOS, ⌘ en lugar de Ctrl (cambiar de pestaña sigue siendo Ctrl+Tab, o ⇧⌘] / ⇧⌘[).

| Atajo                           | Acción                                         |
| ------------------------------- | ---------------------------------------------- |
| `Ctrl+S`                        | Guardar (no compila)                           |
| `Ctrl+Enter`                    | Compilar                                       |
| `Ctrl+Shift+S`                  | Guardar el PDF compilado como…                 |
| `Ctrl+Shift+F`                  | Buscar en el proyecto                          |
| `Ctrl+J` / doble clic en el PDF | SyncTeX: del código al PDF y del PDF al código |
| `Ctrl+Tab`                      | Pestaña siguiente                              |
| `F1`                            | Todos los atajos                               |

## Desarrollo

Requisitos adicionales:

```sh
sudo pacman -S --needed rustup nodejs pnpm base-devel curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg
rustup default stable
```

```sh
pnpm install
pnpm tauri dev        # app en modo desarrollo
pnpm test             # tests del frontend (Vitest)
pnpm typecheck
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Compilar el paquete de la aplicación (en Linux, el AppImage; en macOS, el `.app` y el `.dmg`;
en Windows, el instalador `…-setup.exe`; en `src-tauri/target/release/bundle/`):

```sh
pnpm tauri build
```

En macOS los requisitos de desarrollo son las herramientas de línea de comandos de Xcode
(`xcode-select --install`), Rust con [rustup](https://rustup.rs), Node 26 y pnpm
(`brew install node pnpm`). `scripts/macos/wkprobe.swift` prueba el frontend en WKWebView, el
motor de la app.

En Windows los requisitos de desarrollo son las Build Tools de Visual Studio 2022 con
«Desarrollo para el escritorio con C++», Rust con la toolchain MSVC, Node 26, pnpm y Git for
Windows (en PowerShell):

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e
winget install --id Rustlang.Rustup -e
winget install --id OpenJS.NodeJS -e
winget install --id pnpm.pnpm -e
winget install --id Git.Git -e
```

El plan de construcción, las decisiones de diseño y el estado del proyecto están en
[`CLAUDE.md`](CLAUDE.md). Las capturas salen de la vista previa con datos de ejemplo.

### Wayland + NVIDIA

Con el driver de NVIDIA, el renderer DMA-BUF de WebKitGTK cierra la conexión con Wayland
(«Error 71») por la sincronización explícita del driver. JuTeX define
`__NV_DISABLE_EXPLICIT_SYNC=1` en Wayland + NVIDIA, así la página se sigue dibujando con la
GPU (scroll fluido). Las variables que ya hayas definido se respetan.

Si en tu sistema la ventana sigue fallando, el modo anterior (sin aceleración, más lento)
se activa así:

```sh
JUTEX_SAFE_RENDERER=1 jutex
```

## Contribuir y reportar problemas

Los errores y las ideas van en [Issues](https://github.com/GASDJUGA/jutex/issues). Cómo
preparar el entorno y mandar cambios: [CONTRIBUTING.md](CONTRIBUTING.md). Las
vulnerabilidades se reportan en privado: [SECURITY.md](SECURITY.md). Lo nuevo de cada versión
está en [CHANGELOG.md](CHANGELOG.md).

## Licencia

[GPL-3.0-or-later](LICENSE).
