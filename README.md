# LibreTeX

Editor de LaTeX de escritorio con una experiencia similar a Overleaf, pero **100 % local**:
los proyectos viven en tu disco, se compilan con la distribución TeX de tu máquina y no hay
servidores, cuentas ni telemetría. Solo el gestor de paquetes y el respaldo en GitHub usan
internet, y únicamente cuando tú lo pides.

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
  GitHub: subir, traer cambios y continuar en otra máquina. LibreTeX no guarda contraseñas
  ni tokens.

![Historial con las diferencias de una versión](docs/screenshots/historial.png)

![Respaldo con Git conectado a GitHub](docs/screenshots/respaldo.png)

![Inicio con la lista de proyectos](docs/screenshots/inicio.png)

## Plataformas

- **Linux (Arch):** paquete de Arch y AppImage en los
  [releases](https://github.com/GASDJUGA/libretex/releases); también se puede compilar el
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

- **TeX Live de LibreTeX** (sin sudo): en la pestaña **Paquetes**, «Instalar el TeX Live de
  LibreTeX». Descarga unos 80 MB desde CTAN, ocupa unos 210 MB en
  `~/.local/share/libretex/texlive` y no toca el sistema. Trae lo necesario para XeLaTeX en
  español; los demás paquetes se instalan, actualizan y desinstalan desde la propia app.
- **TeX Live de pacman**: LibreTeX lo usa tal cual. Sus paquetes no se pueden instalar
  desde la app; cuando falta uno, LibreTeX te dice qué paquete de pacman lo trae. Un
  conjunto razonable para empezar:

  ```sh
  sudo pacman -S --needed texlive-basic texlive-latex texlive-latexrecommended \
    texlive-latexextra texlive-xetex texlive-langspanish texlive-binextra
  ```

## Instalación en macOS

1. Abre `LibreTeX_<versión>_aarch64.dmg` y arrastra **LibreTeX** a **Aplicaciones**.
2. La app no está firmada con una cuenta de Apple Developer, así que la primera vez macOS no
   la deja abrir («Apple no pudo verificar…»). Para abrirla igual:
   - **macOS 15 o posterior:** intenta abrirla una vez, cierra el aviso y ve a **Ajustes del
     Sistema → Privacidad y seguridad**; abajo aparece «Se bloqueó el uso de LibreTeX»: pulsa
     **Abrir igualmente** y confirma.
   - **macOS 13 y 14:** clic derecho (o Control + clic) sobre LibreTeX en Aplicaciones →
     **Abrir** → **Abrir**.
   - Si dice que la app «está dañada», quítale la marca de descarga desde la Terminal:

     ```sh
     xattr -dr com.apple.quarantine /Applications/LibreTeX.app
     ```

   Después se abre como cualquier otra app.

Lo demás, igual que en Linux, es opcional:

- **TeX:** [MacTeX](https://tug.org/mactex/) (`brew install --cask mactex-no-gui`, pide la
  contraseña de administrador) o el TeX Live de LibreTeX desde la pestaña **Paquetes**, que
  para verificar la descarga necesita GnuPG (`brew install gnupg`). Con MacTeX los paquetes
  se instalan con `sudo tlmgr install …`; LibreTeX te da el comando para copiarlo.
- **Respaldo con Git:** `git` viene con las herramientas de línea de comandos de Xcode
  (`xcode-select --install`); para GitHub, `brew install gh` y `gh auth login`.

## Instalación en Windows

1. Ejecuta `LibreTeX_<versión>_x64-setup.exe`. Instala LibreTeX solo para tu usuario (en
   `%LOCALAPPDATA%\LibreTeX`), sin pedir permisos de administrador, y lo deja en el menú
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

  LibreTeX instala y desinstala los paquetes de MiKTeX desde la pestaña **Paquetes**, y MiKTeX
  puede instalar al compilar lo que falte. O bien, sin instalar nada antes, el TeX Live de
  LibreTeX desde la pestaña **Paquetes** (verifica la descarga con el GnuPG que trae Git for
  Windows). Un TeX Live oficial instalado en `C:\texlive` también sirve.

- **Respaldo con Git:** `winget install --id Git.Git -e`; para GitHub,
  `winget install --id GitHub.cli -e` y `gh auth login`.

## Dónde guarda LibreTeX sus archivos

Los proyectos viven donde tú los pongas (por defecto, `~/LibreTeX`; en Windows,
`%USERPROFILE%\LibreTeX`); cada uno guarda sus metadatos, el PDF compilado y el historial en
su carpeta oculta `.libretex/`. Lo demás:

| Qué                                               | Linux                     | macOS                                                 | Windows                                  |
| ------------------------------------------------- | ------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| Ajustes, lista de proyectos, diccionario personal | `~/.config/libretex`      | `~/Library/Application Support/org.LibreTeX.libretex` | `%APPDATA%\LibreTeX\libretex\config`     |
| TeX Live de LibreTeX, registro de la papelera     | `~/.local/share/libretex` | `~/Library/Application Support/org.LibreTeX.libretex` | `%APPDATA%\LibreTeX\libretex\data`       |
| Caché (índice de CTAN, catálogo de paquetes)      | `~/.cache/libretex`       | `~/Library/Caches/org.LibreTeX.libretex`              | `%LOCALAPPDATA%\LibreTeX\libretex\cache` |

También se ven en **Ajustes → Rutas**.

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
(«Error 71») por la sincronización explícita del driver. LibreTeX define
`__NV_DISABLE_EXPLICIT_SYNC=1` en Wayland + NVIDIA, así la página se sigue dibujando con la
GPU (scroll fluido). Las variables que ya hayas definido se respetan.

Si en tu sistema la ventana sigue fallando, el modo anterior (sin aceleración, más lento)
se activa así:

```sh
LIBRETEX_SAFE_RENDERER=1 libretex
```

## Contribuir y reportar problemas

Los errores y las ideas van en [Issues](https://github.com/GASDJUGA/libretex/issues). Cómo
preparar el entorno y mandar cambios: [CONTRIBUTING.md](CONTRIBUTING.md). Las
vulnerabilidades se reportan en privado: [SECURITY.md](SECURITY.md). Lo nuevo de cada versión
está en [CHANGELOG.md](CHANGELOG.md).

## Licencia

[GPL-3.0-or-later](LICENSE).
