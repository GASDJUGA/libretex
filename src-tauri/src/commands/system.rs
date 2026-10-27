//! What the frontend needs to know about the machine.

/// `MemTotal` of a `/proc/meminfo` text, in bytes.
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
fn parse_meminfo(text: &str) -> Option<u64> {
    let line = text.lines().find(|l| l.starts_with("MemTotal:"))?;
    let kib: u64 = line.split_whitespace().nth(1)?.parse().ok()?;
    kib.checked_mul(1024)
}

/// The machine's memory in bytes (None if unknown): the PDFs kept for the tabs in the
/// background get a share of it.
#[tauri::command]
pub fn total_memory() -> Option<u64> {
    // Linux only for now; elsewhere the frontend uses a fixed budget.
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/proc/meminfo")
            .ok()
            .and_then(|text| parse_meminfo(&text))
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lee_la_memoria_total() {
        let text = "MemTotal:       32622504 kB\nMemFree:         1234 kB\n";
        assert_eq!(parse_meminfo(text), Some(32622504 * 1024));
        assert_eq!(parse_meminfo("MemFree: 1 kB\n"), None);
        assert_eq!(parse_meminfo("MemTotal: muchos kB\n"), None);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn esta_maquina_tiene_memoria() {
        assert!(total_memory().is_some_and(|bytes| bytes > 256 * 1024 * 1024));
    }
}
