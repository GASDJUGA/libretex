//! Child processes in their own process group (a Job Object on Windows): output streamed by
//! lines, and cancelling kills the whole group (latexmk and the engines it starts, install-tl
//! and its downloads).

use crate::error::{AppError, AppResult};
use std::io::{BufRead, BufReader, Read};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// A running process, in its own process group.
pub struct Run {
    child: Child,
    lines: mpsc::Receiver<String>,
}

/// The job of each running process, by PID, for [`kill_group`] (which only gets the PID).
#[cfg(windows)]
static JOBS: std::sync::LazyLock<
    std::sync::Mutex<std::collections::HashMap<u32, crate::platform::process::Job>>,
> = std::sync::LazyLock::new(Default::default);

#[cfg(windows)]
impl Drop for Run {
    fn drop(&mut self) {
        // Its PID may be reused by another process from now on.
        JOBS.lock().unwrap().remove(&self.child.id());
    }
}

/// Starts `command` in its own process group, with stdout and stderr streamed by lines
/// (available through `Run::next_line` / `Run::wait`). `label` names it in errors.
pub fn spawn(command: Command, label: &str) -> AppResult<Run> {
    spawn_with(command, label, false)
}

/// Like [`spawn`], but a carriage return also ends a line: progress that a program redraws
/// in place (`git push`'s «Writing objects:  45%») arrives as it goes.
pub fn spawn_progress(command: Command, label: &str) -> AppResult<Run> {
    spawn_with(command, label, true)
}

fn spawn_with(mut command: Command, label: &str, split_cr: bool) -> AppResult<Run> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Own process group, so cancelling kills its children too.
        command.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Threading::{CREATE_NO_WINDOW, CREATE_SUSPENDED};
        // Suspended until it is in its job (`Job::adopt`).
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
    }
    #[allow(unused_mut)]
    let mut child = command
        .spawn()
        .map_err(|e| AppError::Other(format!("{label}: {e}")))?;
    #[cfg(windows)]
    {
        let job = crate::platform::process::Job::adopt(&mut child)
            .map_err(|e| AppError::Other(format!("{label}: {e}")))?;
        if let Some(job) = job {
            JOBS.lock().unwrap().insert(child.id(), job);
        }
    }
    let (tx, rx) = mpsc::channel();
    for stream in [
        child
            .stdout
            .take()
            .map(|s| Box::new(s) as Box<dyn Read + Send>),
        child
            .stderr
            .take()
            .map(|s| Box::new(s) as Box<dyn Read + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let tx = tx.clone();
        std::thread::spawn(move || {
            let mut reader = BufReader::new(stream);
            if split_cr {
                read_pieces(&mut reader, &tx);
                return;
            }
            let mut buf = Vec::new();
            while reader
                .read_until(b'\n', &mut buf)
                .map(|n| n > 0)
                .unwrap_or(false)
            {
                let line = String::from_utf8_lossy(&buf)
                    .trim_end_matches(['\n', '\r'])
                    .to_owned();
                if tx.send(line).is_err() {
                    break;
                }
                buf.clear();
            }
        });
    }
    Ok(Run { child, lines: rx })
}

/// Sends what `reader` gives, cut at every `\n` or `\r` (empty pieces are skipped).
fn read_pieces(reader: &mut impl Read, tx: &mpsc::Sender<String>) {
    let mut chunk = [0u8; 4096];
    let mut piece = Vec::new();
    let flush = |piece: &mut Vec<u8>| {
        if piece.is_empty() {
            return true;
        }
        let text = String::from_utf8_lossy(piece).into_owned();
        piece.clear();
        tx.send(text).is_ok()
    };
    loop {
        let n = match reader.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for &byte in &chunk[..n] {
            if byte == b'\n' || byte == b'\r' {
                if !flush(&mut piece) {
                    return;
                }
            } else {
                piece.push(byte);
            }
        }
    }
    flush(&mut piece);
}

impl Run {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    /// Next output line, waiting at most `timeout`. `None` on timeout or when output ended.
    pub fn next_line(&self, timeout: Duration) -> Option<String> {
        self.lines.recv_timeout(timeout).ok()
    }

    /// Waits for the process, forwarding output lines to `on_line`.
    pub fn wait(mut self, mut on_line: impl FnMut(String)) -> AppResult<ExitStatus> {
        loop {
            while let Ok(line) = self.lines.try_recv() {
                on_line(line);
            }
            if let Some(status) = self
                .child
                .try_wait()
                .map_err(|e| AppError::Other(e.to_string()))?
            {
                // Drain what the reader threads still have.
                let deadline = Instant::now() + Duration::from_millis(500);
                while let Ok(line) = self
                    .lines
                    .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                {
                    on_line(line);
                }
                return Ok(status);
            }
            if let Ok(line) = self.lines.recv_timeout(Duration::from_millis(50)) {
                on_line(line);
            }
        }
    }
}

/// Kills the whole process group of a run (SIGTERM, then SIGKILL if it lingers).
#[cfg(unix)]
pub fn kill_group(pid: u32) {
    let pgid = pid as libc::pid_t;
    // SAFETY: killpg only sends a signal; `pgid` is the group created for this run.
    unsafe {
        libc::killpg(pgid, libc::SIGTERM);
    }
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(800));
        // SAFETY: as above; signalling an already-finished group just fails with ESRCH.
        unsafe {
            libc::killpg(pgid, libc::SIGKILL);
        }
    });
}

/// Ends every process of a run's job.
#[cfg(windows)]
pub fn kill_group(pid: u32) {
    if let Some(job) = JOBS.lock().unwrap().get(&pid) {
        job.terminate();
    }
}

/// The processes now in the job of the run `pid`.
#[cfg(all(test, windows))]
pub fn group_pids(pid: u32) -> Vec<u32> {
    JOBS.lock()
        .unwrap()
        .get(&pid)
        .map(|job| job.pids())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_progreso_se_corta_en_retorno_de_carro() {
        let (tx, rx) = mpsc::channel();
        let mut input: &[u8] =
            b"Writing objects:  50% (1/2)\rWriting objects: 100% (2/2), done.\n\nfin";
        read_pieces(&mut input, &tx);
        drop(tx);
        let lines: Vec<String> = rx.iter().collect();
        assert_eq!(
            lines,
            [
                "Writing objects:  50% (1/2)",
                "Writing objects: 100% (2/2), done.",
                "fin"
            ]
        );
    }
}
