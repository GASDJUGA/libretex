# Contribuir a LibreTeX

¡Gracias por el interés! LibreTeX es un editor de LaTeX de escritorio, 100 % local, hecho con
Tauri 2 (Rust) y React + TypeScript.

## Antes de empezar

- Para errores e ideas, abre un [issue](https://github.com/GASDJUGA/libretex/issues) antes de
  un cambio grande, así lo conversamos.
- Las vulnerabilidades no van en issues: mira [SECURITY.md](SECURITY.md).

## Entorno

Requisitos por sistema en el [README](README.md#desarrollo): Rust (con `rustup`), Node 26 y
pnpm (la versión fijada en `packageManager`), y las dependencias de Tauri 2 de tu sistema.
Una distribución TeX es opcional para desarrollar, pero hace falta para los tests de
compilación real (se saltan si no hay TeX).

```sh
pnpm install
pnpm tauri dev
```

## Antes de mandar un PR

Todo esto debe pasar (el CI lo corre en Linux, macOS y Windows):

```sh
pnpm lint
pnpm typecheck
pnpm test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

- Una rama por cambio y un PR a `main` (que está protegida: solo entra por PR con el CI verde).
- Mensajes en español con [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(editor): …`, `fix(compile): …`, `docs: …`.
- La lógica no trivial lleva tests.
- Lo propio de un sistema va detrás de `#[cfg(...)]` o en `src-tauri/src/platform/` (Rust) y
  en `src/lib/platform.ts` (interfaz), sin romper los otros.
- La interfaz está en español e inglés (`src/i18n/es.json` y `en.json`, con las mismas
  claves).
- Sin datos personales en commits, logs de prueba ni capturas.

## Licencia

Al contribuir aceptas que tu aporte se publique bajo la licencia del proyecto,
[GPL-3.0-or-later](LICENSE).
