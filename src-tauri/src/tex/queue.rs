//! Compilation queue: never two compilations of the same project at once. A request that
//! arrives while one runs is kept as *pending*, replacing any older pending request.

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Requested {
    /// Nothing was running: start run `id` now.
    Start(u64),
    /// A compilation is running: the request will run when it finishes.
    Queued,
}

#[derive(Debug, Default)]
struct Slot<R> {
    /// Running compilation: run id and process id (once started).
    running: Option<(u64, Option<u32>)>,
    pending: Option<R>,
    cancelled: bool,
}

#[derive(Debug)]
pub struct Queue<R> {
    slots: HashMap<String, Slot<R>>,
    next_id: u64,
}

impl<R> Default for Queue<R> {
    fn default() -> Self {
        Self {
            slots: HashMap::new(),
            next_id: 1,
        }
    }
}

impl<R> Queue<R> {
    fn new_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    /// A compile request for `project`.
    pub fn request(&mut self, project: &str, request: R) -> Requested {
        let id = self.next_id;
        let slot = self
            .slots
            .entry(project.to_owned())
            .or_insert_with(|| Slot {
                running: None,
                pending: None,
                cancelled: false,
            });
        if slot.running.is_some() {
            slot.pending = Some(request);
            return Requested::Queued;
        }
        slot.running = Some((id, None));
        slot.cancelled = false;
        self.next_id += 1;
        Requested::Start(id)
    }

    /// Records the process id of a run that started.
    pub fn started(&mut self, project: &str, run: u64, pid: u32) {
        if let Some(slot) = self.slots.get_mut(project)
            && slot.running.map(|(id, _)| id) == Some(run)
        {
            slot.running = Some((run, Some(pid)));
        }
    }

    /// A run ended. Returns whether it was cancelled and, if a request is pending, the id
    /// of the run that starts now with it.
    pub fn finished(&mut self, project: &str, run: u64) -> (bool, Option<(u64, R)>) {
        let Some(slot) = self.slots.get_mut(project) else {
            return (false, None);
        };
        if slot.running.map(|(id, _)| id) != Some(run) {
            return (false, None);
        }
        let cancelled = slot.cancelled;
        slot.running = None;
        slot.cancelled = false;
        match slot.pending.take() {
            Some(request) => {
                let id = self.new_id();
                let slot = self.slots.get_mut(project).expect("slot exists");
                slot.running = Some((id, None));
                (cancelled, Some((id, request)))
            }
            None => (cancelled, None),
        }
    }

    /// Cancels the running compilation (and drops any pending one). Returns the process id
    /// to kill, if the run already started.
    pub fn cancel(&mut self, project: &str) -> Option<u32> {
        let slot = self.slots.get_mut(project)?;
        slot.pending = None;
        let (_, pid) = slot.running?;
        slot.cancelled = true;
        pid
    }

    pub fn is_running(&self, project: &str) -> bool {
        self.slots.get(project).is_some_and(|s| s.running.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn una_a_la_vez_y_solo_la_ultima_pendiente() {
        let mut q = Queue::default();
        assert_eq!(q.request("p", "a"), Requested::Start(1));
        assert_eq!(q.request("p", "b"), Requested::Queued);
        assert_eq!(q.request("p", "c"), Requested::Queued);
        // Another project is independent.
        assert_eq!(q.request("otro", "x"), Requested::Start(2));

        let (cancelled, next) = q.finished("p", 1);
        assert!(!cancelled);
        assert_eq!(next, Some((3, "c")));
        assert!(q.is_running("p"));
        assert_eq!(q.finished("p", 3), (false, None));
        assert!(!q.is_running("p"));
    }

    #[test]
    fn cancelar_mata_el_proceso_y_descarta_lo_pendiente() {
        let mut q = Queue::default();
        let Requested::Start(run) = q.request("p", "a") else {
            panic!()
        };
        assert_eq!(q.cancel("p"), None, "aún sin pid");
        q.request("p", "b");
        q.started("p", run, 4242);
        assert_eq!(q.cancel("p"), Some(4242));
        assert_eq!(q.finished("p", run), (true, None));
        assert_eq!(q.request("p", "c"), Requested::Start(2));
    }

    #[test]
    fn ignora_finales_de_ejecuciones_viejas() {
        let mut q: Queue<&str> = Queue::default();
        q.request("p", "a");
        assert_eq!(q.finished("p", 99), (false, None));
        assert!(q.is_running("p"));
        assert_eq!(q.finished("nadie", 1), (false, None));
    }
}
