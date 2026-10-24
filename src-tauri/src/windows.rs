//! Several windows, like a browser (pedido del usuario: arrastrar una pestaña fuera para ver
//! dos proyectos a la vez). Each window has its own project tabs; a project is open in one
//! window at most, so two editors never write the same files. This registry knows which
//! window has which project; the windows report their tabs as they change.

use std::collections::HashMap;
use std::time::{Duration, Instant};

/// The first window (from `tauri.conf.json`): the one whose tabs are remembered.
pub const MAIN: &str = "main";
/// Labels of the other windows: `w-1`, `w-2`… (also in the capability's window list).
pub const PREFIX: &str = "w-";
/// A second close within this time closes the window even if it did not answer.
pub const CLOSE_RETRY: Duration = Duration::from_secs(5);

#[derive(Debug, Default)]
pub struct Windows {
    /// Open projects (tabs) of each window.
    projects: HashMap<String, Vec<String>>,
    /// The project a new window opens with, until it asks for it.
    pending: HashMap<String, String>,
    next: u32,
    /// Windows asked to save before closing, and when.
    closing: HashMap<String, Instant>,
}

impl Windows {
    /// The window that has `project` open, if any.
    pub fn owner(&self, project: &str) -> Option<&str> {
        self.projects
            .iter()
            .find(|(_, ids)| ids.iter().any(|id| id == project))
            .map(|(label, _)| label.as_str())
    }

    /// The tabs `label` reports. A project another window already has stays with it.
    pub fn set(&mut self, label: &str, ids: Vec<String>) {
        let mut mine = Vec::new();
        for id in ids {
            if self.owner(&id).is_none_or(|owner| owner == label) && !mine.contains(&id) {
                mine.push(id);
            }
        }
        self.projects.insert(label.to_owned(), mine);
    }

    /// `project` now belongs to `label` (taken from any other window).
    pub fn adopt(&mut self, label: &str, project: &str) {
        for ids in self.projects.values_mut() {
            ids.retain(|id| id != project);
        }
        self.projects
            .entry(label.to_owned())
            .or_default()
            .push(project.to_owned());
    }

    /// `label` no longer has `project`.
    pub fn release(&mut self, label: &str, project: &str) {
        if let Some(ids) = self.projects.get_mut(label) {
            ids.retain(|id| id != project);
        }
    }

    /// A label for a new window that opens with `project` (which it owns from now on).
    pub fn new_window(&mut self, project: &str) -> String {
        self.next += 1;
        let label = format!("{PREFIX}{}", self.next);
        self.pending.insert(label.clone(), project.to_owned());
        self.adopt(&label, project);
        label
    }

    /// The project a new window must open (once).
    pub fn take_pending(&mut self, label: &str) -> Option<String> {
        self.pending.remove(label)
    }

    /// The other windows with their projects, by label.
    pub fn others(&self, label: &str) -> Vec<(String, Vec<String>)> {
        let mut out: Vec<_> = self
            .projects
            .iter()
            .filter(|(other, _)| other.as_str() != label)
            .map(|(other, ids)| (other.clone(), ids.clone()))
            .collect();
        out.sort();
        out
    }

    /// A window is gone: its projects are free.
    pub fn remove_window(&mut self, label: &str) {
        self.projects.remove(label);
        self.pending.remove(label);
        self.closing.remove(label);
    }

    /// Closing `label` was asked: true if it must first save (the first time), false if it
    /// was already asked recently and did not answer (close anyway).
    pub fn ask_to_close(&mut self, label: &str, now: Instant) -> bool {
        match self.closing.get(label) {
            Some(at) if now.duration_since(*at) < CLOSE_RETRY => false,
            _ => {
                self.closing.insert(label.to_owned(), now);
                true
            }
        }
    }

    /// The window saved and closes itself.
    pub fn closing_now(&mut self, label: &str) {
        self.closing.insert(label.to_owned(), Instant::now());
    }
}

/// A label LibreTeX gave to one of its windows.
pub fn is_window_label(label: &str) -> bool {
    label == MAIN
        || label
            .strip_prefix(PREFIX)
            .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn un_proyecto_esta_en_una_sola_ventana() {
        let mut w = Windows::default();
        w.set("main", ids(&["a", "b"]));
        assert_eq!(w.owner("a"), Some("main"));
        // Another window reporting `a` does not take it.
        w.set("w-1", ids(&["a", "c"]));
        assert_eq!(w.owner("a"), Some("main"));
        assert_eq!(w.owner("c"), Some("w-1"));
        assert_eq!(w.owner("z"), None);
    }

    #[test]
    fn ventana_nueva_con_su_proyecto() {
        let mut w = Windows::default();
        w.set("main", ids(&["a", "b"]));
        let label = w.new_window("b");
        assert_eq!(label, "w-1");
        assert_eq!(w.owner("b"), Some("w-1"));
        assert_eq!(w.take_pending("w-1").as_deref(), Some("b"));
        assert_eq!(w.take_pending("w-1"), None);
        assert_eq!(w.new_window("a"), "w-2");
        assert_eq!(
            w.others("main"),
            vec![("w-1".into(), ids(&["b"])), ("w-2".into(), ids(&["a"]))]
        );
    }

    #[test]
    fn mover_y_cerrar() {
        let mut w = Windows::default();
        w.set("main", ids(&["a"]));
        w.set("w-1", ids(&["b"]));
        w.adopt("w-1", "a");
        assert_eq!(w.owner("a"), Some("w-1"));
        w.release("w-1", "a");
        assert_eq!(w.owner("a"), None);
        w.remove_window("w-1");
        assert_eq!(w.owner("b"), None);
    }

    #[test]
    fn cerrar_pide_guardar_una_vez() {
        let mut w = Windows::default();
        let now = Instant::now();
        assert!(w.ask_to_close("w-1", now));
        // A second click while it saves (or if it does not answer) closes it.
        assert!(!w.ask_to_close("w-1", now + Duration::from_secs(1)));
        assert!(w.ask_to_close("w-1", now + CLOSE_RETRY + Duration::from_secs(1)));
    }

    #[test]
    fn etiquetas_validas() {
        assert!(is_window_label("main"));
        assert!(is_window_label("w-12"));
        assert!(!is_window_label("w-"));
        assert!(!is_window_label("w-1x"));
        assert!(!is_window_label("otra"));
    }
}
