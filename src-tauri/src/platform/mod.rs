//! Code that depends on the operating system (see «Reglas desde ya» in CLAUDE.md).

pub mod clipboard;
#[cfg(target_os = "macos")]
pub mod trash;
