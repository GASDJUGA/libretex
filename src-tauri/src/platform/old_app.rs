//! Windows: LibreTeX still open while JuTeX moves its folders (2.0.0). Windows does not let a
//! folder be renamed while a file inside is open, and LibreTeX's webview keeps its storage
//! open (the cookies even for reading): the move would fail, JuTeX would start with new empty
//! folders and, since those then exist, never move the old ones. So before moving anything
//! JuTeX asks to close LibreTeX, or does not open (it tries again next time).

use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
use windows_sys::Win32::Globalization::GetUserDefaultUILanguage;
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    IDRETRY, MB_ICONINFORMATION, MB_RETRYCANCEL, MB_SETFOREGROUND, MessageBoxW,
};

/// LibreTeX's program (`mainBinaryName` before 2.0.0).
const OLD_EXE: &str = "libretex.exe";

/// Whether `name` (a process's image name) is `exe`, ignoring case as Windows does.
pub fn same_exe(name: &str, exe: &str) -> bool {
    name.eq_ignore_ascii_case(exe)
}

/// Whether the user's interface is in Spanish (primary language of a `LANGID`).
pub fn is_spanish(langid: u16) -> bool {
    const LANG_SPANISH: u16 = 0x0a;
    langid & 0x3ff == LANG_SPANISH
}

/// Whether a process with this image name is running.
fn is_running(exe: &str) -> bool {
    // SAFETY: a snapshot of the system's processes, walked with a correctly sized entry and
    // closed here.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return false;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut found = false;
        let mut more = Process32FirstW(snapshot, &mut entry) != 0;
        while more && !found {
            let len = entry
                .szExeFile
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(entry.szExeFile.len());
            found = same_exe(&String::from_utf16_lossy(&entry.szExeFile[..len]), exe);
            more = Process32NextW(snapshot, &mut entry) != 0;
        }
        CloseHandle(snapshot);
        found
    }
}

/// Asks to close LibreTeX; whether the user chose to try again.
fn ask_to_close() -> bool {
    // SAFETY: reads the user's language.
    let spanish = is_spanish(unsafe { GetUserDefaultUILanguage() });
    let text = if spanish {
        "LibreTeX está abierto.\n\nCiérralo para que JuTeX traiga tus proyectos, ajustes y \
         pestañas, y pulsa Reintentar.\n\nSi cancelas, JuTeX no se abre ahora; lo hará la \
         próxima vez."
    } else {
        "LibreTeX is open.\n\nClose it so JuTeX can bring over your projects, settings and \
         tabs, then click Retry.\n\nIf you cancel, JuTeX does not open now; it will next time."
    };
    let wide = |s: &str| s.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let (text, title) = (wide(text), wide("JuTeX"));
    // SAFETY: both strings end in 0 and outlive the call; no owner window yet.
    let answer = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_RETRYCANCEL | MB_ICONINFORMATION | MB_SETFOREGROUND,
        )
    };
    answer == IDRETRY
}

/// Waits until LibreTeX is closed, asking the user; `false` if they cancelled.
pub fn wait_until_closed() -> bool {
    while is_running(OLD_EXE) {
        if !ask_to_close() {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn el_programa_se_reconoce_sin_mayusculas() {
        assert!(same_exe("LibreTeX.exe", OLD_EXE));
        assert!(same_exe("libretex.exe", OLD_EXE));
        assert!(!same_exe("jutex.exe", OLD_EXE));
        assert!(!same_exe("libretex.exe.bak", OLD_EXE));
    }

    #[test]
    fn idioma_de_la_interfaz() {
        assert!(is_spanish(0x080a)); // es-MX
        assert!(is_spanish(0x2c0a)); // es-AR
        assert!(!is_spanish(0x0409)); // en-US
        assert!(!is_spanish(0x0416)); // pt-BR
    }

    #[test]
    fn este_proceso_esta_corriendo() {
        let me = std::env::current_exe().unwrap();
        let name = me.file_name().unwrap().to_string_lossy();
        assert!(is_running(&name));
        assert!(!is_running("no-existe-ningun-programa-asi.exe"));
    }
}
