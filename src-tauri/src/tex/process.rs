//! Child processes in their own process group: output streamed by lines, and cancelling
//! kills the whole group (latexmk and the engines it starts, install-tl and its downloads).

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

/// Starts `command` in its own process group, with stdout and stderr streamed by lines
/// (available through `Run::next_line` / `Run::wait`). `label` names it in errors.
pub fn spawn(mut command: Command, label: &str) -> AppResult<Run> {
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
    let mut child = command
        .spawn()
        .map_err(|e| AppError::Other(format!("{label}: {e}")))?;
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

#[cfg(not(unix))]
pub fn kill_group(_pid: u32) {}
