# Renombrar LibreTeX a JuTeX — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendada) o
> superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para seguir el avance.

**Objetivo:** que el proyecto se llame **JuTeX** («Just a TeX editor») en todo lo que se ve, se
instala y se guarda. Quien ya usa LibreTeX abre JuTeX y encuentra sus proyectos, ajustes,
sesiones, historial y TeX Live tal como los dejó, sin hacer nada.

**Arquitectura:**

- **Renombrar** todo lo visible (textos, logo, ventana, paquetes) y lo interno (crates,
  constantes, prefijos).
- **Migrar en una sola dirección** lo que ya quedó guardado con el nombre viejo:
  - carpetas de la app: Rust, al arrancar y antes de crear la primera ventana;
  - la carpeta `.libretex/` de cada proyecto: Rust, al abrirlo;
  - claves de `localStorage`: TypeScript, al arrancar la interfaz;
  - valores con el nombre viejo en archivos: se aceptan como alias al leerlos.
- Después de migrar, nada vuelve a escribir el nombre viejo.

**Stack:** el de siempre (Tauri 2, Rust, React + TS); sin dependencias nuevas.

**Pedido del usuario (2026-11-09):** otro proyecto publicó el 24 de octubre un editor de TeX en
línea llamado LibreTeX. El nombre nuevo es **JuTeX**, escrito exactamente así. En el logo solo
cambia la L por una J.

## Restricciones globales

- **Nombre:**
  - Visible: `JuTeX`.
  - Minúsculas: `jutex` (crate, paquete de Arch, binario, carpetas XDG, `.jutex/`).
  - Variables de entorno: `JUTEX_`.
  - Prefijo de CSS: `jt-` (antes `lt-`).
- **Identificador de la app:** `org.jutex.app` (antes `org.libretex.app`). Carpetas de
  `directories`: `ProjectDirs::from("org", "JuTeX", "jutex")`.
- **Nada se pierde:**
  - La migración nunca borra datos viejos si copiarlos falló. Si una carpeta nueva ya existe, no
    se toca.
  - Un fallo al migrar no impide arrancar: queda en el log y la app sigue con lo que haya.
- **El pasado no se reescribe:** tags, releases, notas de versiones anteriores, `CHANGELOG.md`
  hasta la 1.2.1, entradas viejas de «Estado actual» y «Decisiones» de `CLAUDE.md`, y los
  commits de historial y respaldo ya hechos.
- **Plataformas:**
  - El código es común.
  - Las rutas viejas por sistema van en un solo lugar (`migrate.rs`).
  - Lo que solo se puede comprobar en macOS o Windows queda como tarea de esa línea (tarea 9).
- **Flujo:**
  - Rama `jutex`. Un commit por tarea y PR a `main` con el CI verde.
  - La versión y el release (tarea 10) van solo con la confirmación del usuario.

## Foco de revisión

1. **Las dos apps abiertas, o carpetas viejas y nuevas a la vez.** Si `~/.config/jutex` ya
   existe, la migración no mezcla ni pisa nada. Test en la tarea 1.
2. **Mover entre discos distintos** (`rename` falla con `EXDEV`): se copia, y lo viejo solo se
   borra si la copia terminó completa. Test en la tarea 1.
3. **TeX Live de la app movido de lugar:** sigue compilando y `tlmgr` sigue funcionando. Sus
   rutas son relativas; solo dos comentarios tienen la ruta absoluta. Verificación real en la
   tarea 1 y en la tarea 8.
4. **Historial anterior al cambio:** las versiones con `LibreTeX-Kind:` siguen mostrando su
   tipo (manual, automática, compilación). Test en la tarea 2.
5. **Proyecto con `.libretex/` y `.jutex/` a la vez** (abierto en las dos apps): se usa
   `.jutex/`. La vieja queda, oculta en el árbol y fuera de la búsqueda, el respaldo, el
   historial y el ZIP. Test en la tarea 2.

---

### Tarea 1: Migración de las carpetas de la app

**Archivos:**

- Crear: `src-tauri/src/migrate.rs`
- Modificar: `src-tauri/src/lib.rs` (llamarla en `run()` antes de `Builder::default()` y de
  crear `AppState`)

**Interfaces:**

- Produce:
  - `pub struct MovePair { pub from: PathBuf, pub to: PathBuf }`
  - `pub fn app_pairs(old: &ProjectDirs, new: &ProjectDirs, base: &BaseDirs) -> Vec<MovePair>`:
    configuración, datos y caché (sin repetir, porque en macOS la configuración y los datos son
    la misma carpeta).
  - Datos de la webview según el sistema:
    - Linux: `data_dir/org.libretex.app`.
    - Windows: `data_local_dir/org.libretex.app`.
    - macOS: `~/Library/WebKit/org.libretex.app`.
  - `pub fn migrate(pairs: &[MovePair]) -> Vec<String>`: devuelve un aviso por par que no se
    pudo migrar.
  - `pub fn move_dir(from: &Path, to: &Path) -> io::Result<()>`: primero `rename`; si falla por
    otro disco, copia recursiva y recién entonces borra el origen. Si la copia falla, borra lo
    copiado en `to` y deja el origen intacto.

- [ ] **Paso 1: tests que fallan.** En `migrate.rs`, con `tempfile`:
  - `mueve_lo_viejo_si_lo_nuevo_no_existe`: `old/settings.json` → `new/settings.json`; `old` ya
    no existe.
  - `no_toca_nada_si_lo_nuevo_ya_existe`: el contenido de los dos queda igual.
  - `sin_carpeta_vieja_no_hace_nada`: devuelve `vec![]`.
  - `pares_repetidos_se_migran_una_vez`: macOS, con configuración y datos iguales.
  - `copia_fallida_deja_el_origen`: forzar el fallo con un archivo sin permiso de lectura,
    `cfg(unix)`. El origen sigue entero y `to` no existe.
  - `el_tex_live_movido_compila`: test ignorado (`#[ignore]`) que mueve una copia del TeX Live de
    la app a otra carpeta y compila la plantilla con XeLaTeX usando el `bin` nuevo.
- [ ] **Paso 2:** `cargo test migrate` → falla (el módulo no existe).
- [ ] **Paso 3:** implementar.
  - `run()` llama a `migrate::migrate(&migrate::app_pairs(…))` antes de construir la app.
  - Los avisos van a `eprintln!`, igual que los otros problemas de arranque.
- [ ] **Paso 4:** `cargo test migrate` pasa. Correr también el test ignorado con el TeX Live real:
      `cargo test migrate -- --ignored`.
- [ ] **Paso 5:** commit `feat(migrate): mover las carpetas de LibreTeX a las de JuTeX al arrancar`.

### Tarea 2: Nombres en Rust y datos de cada proyecto

**Archivos:**

- Modificar:
  - `src-tauri/src/projects/meta.rs`: `META_DIR = ".jutex"` y
    `LEGACY_META_DIR = ".libretex"`.
  - Todo lo que hoy oculta o ignora `META_DIR` debe ignorar también `LEGACY_META_DIR`:
    `files/mod.rs`, `files/watch.rs`, `files/search.rs`, `files/index.rs`,
    `projects/export.rs`, `projects/zip_import.rs`, `history/mod.rs` (`info/exclude`) y
    `backup/mod.rs`.
  - `projects/ops.rs`: al abrir un proyecto, `meta::migrate_legacy(root)`.
  - `state.rs`: `ProjectDirs::from("org", "JuTeX", "jutex")`. Si `projectsDir` no está fijado en
    `settings.json`, la carpeta de proyectos sale de `default_projects_dir` (ver Decisiones, 1).
    La que el usuario elija en Ajustes, cualquiera de las dos, se guarda como siempre.
  - `history/mod.rs`:
    - firma `JuTeX <jutex@localhost>`;
    - trailer `JuTeX-Kind: `;
    - al leer, aceptar también `LibreTeX-Kind: `.
  - `backup/mod.rs`:
    - las líneas del `.gitignore` llevan `.jutex/`;
    - encabezado `# JuTeX: …`;
    - `IdentitySource::Jutex`.
  - `tex/backends.rs` y `settings.rs`: `TexChoice::Jutex` serializado `"jutex"`, con
    `#[serde(alias = "libretex")]`.
  - `main.rs`: variable `JUTEX_SAFE_RENDERER`; se acepta también `LIBRETEX_SAFE_RENDERER`.
  - `files/watch.rs`: `TMP_MARKER = ".jutex-tmp-"` y el hilo `jutex-watch`.
  - `projects/export.rs`, `tex/backends.rs` e `install_tl.rs`: prefijos temporales y
    `jutex.profile`.
  - `platform/menu.rs`: `jutex-quit`.
  - `platform/webview2.rs`: `jutex-files-dropped`; cambia junto con el TS (tarea 3).
  - `commands/windows.rs`: título `JuTeX`.
  - Los tests que escriben rutas `.libretex/…` pasan a `META_DIR`.

**Interfaces:**

- Produce:
  - `pub fn migrate_legacy(root: &Path) -> AppResult<()>`, en `projects/meta.rs`:
    - si existe `.libretex/` y no `.jutex/`, la renombra;
    - si el proyecto tiene `.gitignore` con una línea `.libretex/` (o `/.libretex`) y ninguna
      `.jutex/`, agrega `.jutex/` justo después.
  - `LEGACY_META_DIR`.
  - `pub fn default_projects_dir(home: &Path) -> PathBuf`, en `state.rs`:
    - `~/JuTeX` si existe;
    - si no, `~/LibreTeX` si existe;
    - si no, `~/JuTeX` (se crea con el primer proyecto, como hoy).
  - Las demás partes de Rust solo usan `META_DIR` y `LEGACY_META_DIR`, nunca el texto literal.

- [ ] **Paso 1: tests que fallan.**
  - `state::tests::instalacion_nueva_usa_jutex`: sin ninguna de las dos carpetas → `~/JuTeX`.
  - `state::tests::con_libretex_usa_libretex`: solo `~/LibreTeX` → `~/LibreTeX`.
  - `state::tests::con_las_dos_usa_jutex`: con las dos → `~/JuTeX`.
  - `meta::tests::migra_la_carpeta_vieja`.
  - `meta::tests::con_las_dos_se_queda_la_nueva`: `.libretex/` sigue ahí y `.jutex/` no
    cambia.
  - `meta::tests::agrega_jutex_al_gitignore_de_un_respaldo`.
  - `history::tests::lee_el_tipo_de_versiones_de_libretex`: commit con
    `LibreTeX-Kind: compile` → `kind == Compile`.
  - `settings::tests::acepta_texdistribution_libretex`: lee `"libretex"` y guarda `"jutex"`.
  - `files::tests::oculta_la_carpeta_vieja`: el árbol no lista `.libretex/`.
  - `export::tests::el_zip_no_lleva_ninguna_de_las_dos`.
  - `main` (Linux): `LIBRETEX_SAFE_RENDERER=1` sigue activando el modo seguro.
- [ ] **Paso 2:** `cargo test` → fallan los nuevos.
- [ ] **Paso 3:** implementar.
  - Verificar que no queda nada con el nombre viejo:
    `git grep -n -i libretex -- src-tauri/src`. Solo puede salir `LEGACY_META_DIR`, los alias,
    `migrate.rs` y los tests de compatibilidad.
- [ ] **Paso 4:** `cargo fmt --check`, `cargo clippy -- -D warnings` y `cargo test` pasan.
- [ ] **Paso 5:** commit `refactor(rust): JuTeX en las carpetas, el historial y los ajustes, leyendo lo de LibreTeX`.

### Tarea 3: Interfaz: textos, títulos, almacenamiento local

**Archivos:**

- Crear: `src/lib/storageMigration.ts` y su test.
- Modificar:
  - `src/i18n/es.json` y `en.json`: «LibreTeX» → «JuTeX»; `.libretex/` → `.jutex/`.
  - `index.html`: `<title>`.
  - `src/lib/windows.ts`:
    - título `… — JuTeX`;
    - el tipo `application/x-libretex-tab` → `application/x-jutex-tab`.
  - `src/lib/windowsDrop.ts`: `jutex-files-dropped`.
  - `src/components/common/Logo.tsx`: `aria-label`.
  - Las claves `libretex:` → `jutex:` en:
    - `src/app/Project.tsx`
    - `src/editor/completionUsage.ts`
    - `src/lib/session.ts`
    - `src/store/workspaces.ts`
  - `src/store/settings.ts`: `LEGACY_STORAGE_KEY` queda como está (ya es una clave vieja).
  - `src/components/pdf/PdfPane.tsx`: `.jutex/build`.
  - Mocks:
    - `src/lib/mockBackend.ts` y `src/lib/mockBackup.ts`: `.jutex`, y también ocultar
      `.libretex`.
    - `src/mocks/*`.
  - Tipos de TS que reflejan Rust: `TexChoice` `"jutex"` e `IdentitySource` `"jutex"`.
  - `src/main.tsx`: llamar a `migrateStorage(localStorage)` antes de montar.

**Interfaces:**

- Produce:
  - `export const STORAGE_RENAMES: [from: string, to: string][]` con dos pares:
    - `["libretex:", "jutex:"]`;
    - `["react-resizable-panels:libretex:", "react-resizable-panels:jutex:"]`: las claves que
      la librería de paneles arma a partir del `id`.
  - `export function migrateStorage(storage: Storage, renames = STORAGE_RENAMES): void`:
    - por cada clave que empieza con un `from`, la copia a `to` + el resto si la nueva no
      existe, y luego borra la vieja;
    - no toca `LEGACY_STORAGE_KEY` (`libretex:settings`), que `store/settings.ts` todavía lee
      para su migración de octubre;
    - envuelta en `try/catch`: un almacenamiento bloqueado no impide arrancar.

- [ ] **Paso 1: tests que fallan** (`storageMigration.test.ts`):
  - `libretex:p:session` pasa a `jutex:p:session` con el mismo valor y la vieja desaparece;
  - `react-resizable-panels:libretex:p:main:side:editor:pdf` pasa a
    `react-resizable-panels:jutex:p:main:side:editor:pdf`;
  - si `jutex:p:session` ya existe, se conserva y la vieja se borra;
  - `libretex:settings` sigue igual;
  - las claves ajenas no se tocan.
- [ ] **Paso 2:** `pnpm test storageMigration` → falla.
- [ ] **Paso 3:** implementar y hacer el reemplazo en los archivos de la lista. Actualizar los
      tests que nombran las claves o el título.
  - `git grep -n -i libretex -- src index.html` solo debe dar `storageMigration`,
    `LEGACY_STORAGE_KEY` y los mocks que ocultan `.libretex`.
- [ ] **Paso 4:** `pnpm typecheck`, `pnpm lint` y `pnpm test` pasan.
- [ ] **Paso 5:** commit `feat(ui): JuTeX en la interfaz y migración de lo guardado en el navegador`.

### Tarea 4: Prefijo de CSS `lt-` → `jt-`

**Archivos:** los 28 de `src/` que usan `--lt-*` o clases `lt-*`. Son 341 apariciones, entre
ellas `styles/index.css`, `test/tokens.test.ts` y `lib/transition.ts`.

- [ ] **Paso 1:** reemplazar con límites de palabra: `--lt-` → `--jt-` y la clase `lt-` →
      `jt-`. Revisar el diff para que no toque palabras como `alt-` o `filt-`, ni `lt-` dentro de
      otras.
- [ ] **Paso 2:** `git grep -n -E '(^|[^a-z])(--)?lt-[a-z]' -- src index.html` → vacío.
- [ ] **Paso 3:** `pnpm typecheck`, `lint` y `test` pasan. En la vista previa (puerto 1430), los
      temas, las animaciones (`jt-view-*`, `jt-hold`) y el PDF se ven igual que antes.
- [ ] **Paso 4:** commit `refactor(ui): prefijo jt- en tokens y clases`.

### Tarea 5: Logo con J

**Archivos:**

- Modificar: `src/assets/logo.svg` y `src/components/common/Logo.tsx`.
- Regenerar: `src-tauri/icons/*` con `pnpm tauri icon` (verificar antes que la CLI acepta SVG;
  si no, exportar un PNG de 1024 px).

- [ ] **Paso 1:** dibujar dos o tres variantes de la J en el lugar de la L de hoy:
  - la L de hoy es el trazo `M14 14h8v22h12v8H14z`;
  - la T queda igual (`M28 24h24v7h-8.5v21h-7V31H28z`);
  - mismas proporciones y grosor de trazo (8);
  - la J no debe pisar la barra de la T (x ≥ 28, y 24–31).

  Mostrarlas al usuario, en tamaño grande y a 16 y 32 px, para que elija una. **Las elige el
  usuario.**

- [ ] **Paso 2:** aplicar la elegida a `logo.svg` y `Logo.tsx` y regenerar los íconos.
- [ ] **Paso 3:** la vista previa muestra el logo nuevo en el inicio y en «Cargando proyecto»;
      `pnpm test` pasa.
- [ ] **Paso 4:** commit `feat(ui): logo de JuTeX`.

### Tarea 6: Empaquetado e identidad de la app

**Archivos:**

- `package.json`: `name: "jutex"`.
- `src-tauri/Cargo.toml`: `name = "jutex"` y `[lib] name = "jutex_lib"`.
- `src-tauri/src/main.rs`: `jutex_lib::run()`.
- `Cargo.lock`.
- `src-tauri/tauri.conf.json`: `productName: "JuTeX"`, `identifier: "org.jutex.app"`, título de
  la ventana `JuTeX`.
- `tauri.windows.conf.json` y `tauri.macos.conf.json`.
- `packaging/arch/PKGBUILD`:
  - `pkgname=jutex`, `conflicts=('libretex')`, `replaces=('libretex')`;
  - el `source` clona `GASDJUGA/jutex` (ver tarea 8);
  - el binario, el `.desktop` y `/usr/lib/JuTeX`.
- `.gitignore` y `eslint.config.js`: rutas de `packaging/arch/libretex/` → `jutex/`.
- `vite/pdfjsAssets.ts`.

- [ ] **Paso 1:** hacer los cambios. `git grep -n -i libretex -- package.json src-tauri/*.json
src-tauri/Cargo.toml packaging .gitignore eslint.config.js vite` → vacío.
- [ ] **Paso 2:** `pnpm tauri build`:
  - sale `JuTeX_<versión>_amd64.AppImage`;
  - el `.deb` intermedio trae `/usr/bin/jutex`, `jutex.desktop` (Name=JuTeX) y
    `/usr/lib/JuTeX/templates`.
- [ ] **Paso 3: prueba de migración en Xvfb** con un HOME de prueba que tenga los datos viejos:
  - copiar `~/.config/libretex`, `~/.local/share/libretex` (con el TeX Live),
    `~/.local/share/org.libretex.app` y un proyecto con `.libretex/`;
  - al arrancar el AppImage:
    - el inicio muestra los mismos proyectos;
    - Ajustes conserva el tema y la distribución;
    - las pestañas de la sesión se reabren, la de un proyecto con su cursor;
    - compila con el TeX Live movido;
    - el historial muestra las versiones viejas con su tipo;
    - el proyecto tiene `.jutex/` y ya no `.libretex/`;
  - no queda ninguna carpeta `libretex` en ese HOME.
- [ ] **Paso 4:** `makepkg -f --nodeps` con la copia del PKGBUILD apuntando al commit (como en
      la 1.2.1). El paquete se llama `jutex-<versión>-1-x86_64.pkg.tar.zst` y declara
      `conflicts`/`replaces` con `libretex`.
- [ ] **Paso 5:** commit `chore(build): paquete, binario e identificador de JuTeX`.

### Tarea 7: Documentación, capturas y CLAUDE.md

**Archivos:**

- `README.md`:
  - JuTeX, «Just a TeX editor»;
  - una línea «Antes se llamaba LibreTeX; se cambió porque ya existe otro editor con ese
    nombre»;
  - rutas de datos nuevas por sistema;
  - cómo pasar de LibreTeX a JuTeX en cada sistema: desinstalar el viejo; los datos se migran
    solos.
- `CONTRIBUTING.md` y `SECURITY.md`: nombre y URL del repositorio.
- `docs/screenshots/*`: regenerar con `scripts/screenshots.py`.
- `CLAUDE.md`:
  - título y secciones 0–10 con el nombre nuevo, las rutas `.jutex/`, `~/.config/jutex`… y
    el prefijo `jt-`;
  - una entrada nueva en «Estado actual»;
  - en «Decisiones», el cambio de nombre y las decisiones de este plan;
  - las entradas viejas de 11 y 12 no se tocan.
- Memoria de Claude: `MEMORY.md` y la memoria de sesiones por plataforma, si nombran
  «LibreTeX».

- [ ] **Paso 1:** cambios y capturas.
  - `git grep -n -i libretex -- README.md CONTRIBUTING.md SECURITY.md` → solo la línea de «antes
    se llamaba» y las instrucciones de migración.
- [ ] **Paso 2:** `pnpm lint` (Prettier) pasa.
- [ ] **Paso 3:** commit `docs: JuTeX`.

### Tarea 8: Repositorio en GitHub

- [ ] **Paso 1:** `gh repo rename jutex` (decidido por el usuario el 2026-11-09). GitHub redirige
      `GASDJUGA/libretex` a `GASDJUGA/jutex`: los releases y tags viejos siguen ahí con sus archivos
      llamados LibreTeX.
- [ ] **Paso 2:** `git remote set-url origin https://github.com/GASDJUGA/jutex.git` en Linux.
      Dejar el mismo comando en «Estado actual» para el Mac y Windows.
- [ ] **Paso 3:** cambiar la descripción del repositorio (`gh repo edit --description`) a
      «JuTeX — Just a TeX editor: editor LaTeX local».
- [ ] **Paso 4:** PR de la rama `jutex` → CI verde → fusionar.

### Tarea 9: Verificación en macOS y en Windows (en sus líneas)

Para los chats del Mac y de Windows. Se hace desde `main` ya fusionado.

- **macOS:**
  - `pnpm tauri build` produce `JuTeX.app` y `JuTeX_<versión>_aarch64.dmg`.
  - Con LibreTeX ya usado, al abrir JuTeX se migran:
    - `~/Library/Application Support/org.LibreTeX.libretex`;
    - `~/Library/Caches/org.LibreTeX.libretex`;
    - la sesión de la webview (`~/Library/WebKit/org.libretex.app`).
  - Si WKWebView no lee la copia, solo se pierden las pestañas y los tamaños de los paneles:
    anotarlo y decidir con el usuario.
  - Borrar `LibreTeX.app` de Aplicaciones a mano.
- **Windows:**
  - `pnpm tauri build` produce `JuTeX_<versión>_x64-setup.exe`. Es un programa distinto para
    Windows: se instala aparte en `%LOCALAPPDATA%\JuTeX`.
  - Al abrirlo se migran `%APPDATA%\LibreTeX\libretex`, `%LOCALAPPDATA%\LibreTeX\libretex` y
    `%LOCALAPPDATA%\org.libretex.app` (WebView2).
  - Compila con el TeX Live de la app movido, si estaba instalado.
  - Luego se desinstala LibreTeX desde Configuración.

### Tarea 10: Versión y release (con confirmación)

- [ ] Versión **2.0.0** (ver Decisiones, 2) en `package.json`, `Cargo.toml`,
      `tauri.conf.json` y el `pkgver`.
- [ ] `docs/releases/<versión>.md`: el cambio de nombre arriba, cómo pasar de LibreTeX a JuTeX
      en cada sistema y qué se migra solo. Agregarlo también a `CHANGELOG.md`.
- [ ] El mismo flujo que la 1.2.1:
  - borrador con el AppImage y el paquete de Arch;
  - el Mac y Windows suben los suyos;
  - publicarlo con la confirmación del usuario.

---

## Decisiones del usuario (2026-11-09)

1. **Carpeta de proyectos.** Se pueden usar las dos.
   - Una instalación nueva usa `~/JuTeX`.
   - Si existe `~/LibreTeX` y no `~/JuTeX`, se usa `~/LibreTeX` sin mover nada.
   - Los proyectos de cualquiera de las dos siguen registrados por su ruta.
   - En Ajustes se puede elegir cualquiera.
   - Ver `default_projects_dir` en la tarea 2.
2. **Versión 2.0.0:** la app cambia poco, pero el cambio de identidad es grande.
3. **Repositorio de GitHub:** se renombra `libretex` → `jutex` (tarea 8).
4. **Carpeta local del repositorio:** queda igual (`~/Documents/Claude/libretex`,
   `~/Developer/libretex` en el Mac). Es solo local, no del proyecto.
