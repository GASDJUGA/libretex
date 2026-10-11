# LibreTeX

Editor de LaTeX de escritorio con una experiencia similar a Overleaf, pero **100 % local**:
los proyectos viven en tu disco, se compilan con la distribución TeX instalada en tu máquina
y no hay servidores, cuentas ni telemetría.

- **Inicio:** lista de proyectos; crear desde plantilla, abrir carpetas, importar ZIP.
- **Vista de proyecto:** árbol de archivos, esquema, editor CodeMirror, visor PDF con
  SyncTeX, errores enlazados al código y preview de matemáticas en vivo.
- **Paquetes:** buscar, instalar, actualizar y desinstalar paquetes de LaTeX.

> Estado: en desarrollo temprano (Fase 0). Ver el plan en [`CLAUDE.md`](CLAUDE.md).

## Requisitos (Arch Linux)

```sh
sudo pacman -S --needed rustup nodejs pnpm base-devel webkit2gtk-4.1 curl wget file openssl \
  appmenu-gtk-module libappindicator-gtk3 librsvg
rustup default stable
```

Distribución TeX (para compilar documentos):

```sh
sudo pacman -S --needed texlive-basic texlive-latex texlive-latexrecommended \
  texlive-latexextra texlive-xetex texlive-langspanish texlive-binextra
```

## Desarrollo

```sh
pnpm install
pnpm tauri dev        # app en modo desarrollo
pnpm test             # tests del frontend (Vitest)
pnpm typecheck
pnpm lint
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Compilar el paquete de la aplicación:

```sh
pnpm tauri build
```

### Wayland + NVIDIA

Con el driver de NVIDIA, el renderer DMA-BUF de WebKitGTK cierra la conexión con Wayland
(«Error 71») por la sincronización explícita del driver. LibreTeX define
`__NV_DISABLE_EXPLICIT_SYNC=1` en Wayland + NVIDIA, así la página se sigue dibujando con la
GPU (scroll fluido). Las variables que ya hayas definido se respetan.

Si en tu sistema la ventana sigue fallando, el modo anterior (sin aceleración, más lento)
se activa así:

```sh
LIBRETEX_SAFE_RENDERER=1 pnpm tauri dev
```

## Licencia

[GPL-3.0-or-later](LICENSE).
