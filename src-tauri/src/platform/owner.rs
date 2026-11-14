//! Who owns the folders a TeX is taken from, on Windows. Any user may create folders at the
//! root of `C:\` (the root grants `AD` to «Authenticated Users», and what is created there
//! inherits their modify rights), so another user of the PC could create `C:\texlive\…` or
//! `C:\Strawberry\…` with programs JuTeX would run when compiling. A folder there is used
//! only if each one, from the top down to the programs, belongs to the user or to the system
//! (an installer run as administrator): another user's folder is ignored.
//!
//! What it does not cover: a legitimate `C:\texlive` keeps the modify rights it inherits, so
//! another user can still change the files inside it. That is how the TeX Live installer leaves
//! it (it is also why `tlmgr` works without an administrator), not something JuTeX adds.

use std::path::Path;

/// Whether `top` and every folder from it down to `dir` belong to the user or the system.
#[cfg(windows)]
pub fn trusted_tree(top: &Path, dir: &Path) -> bool {
    let Ok(rest) = dir.strip_prefix(top) else {
        return false;
    };
    let Some(user) = windows::current_user() else {
        return false;
    };
    let trusted = |path: &Path| windows::owner(path).is_some_and(|o| is_trusted_owner(&o, &user));
    let mut path = top.to_path_buf();
    if !trusted(&path) {
        return false;
    }
    rest.components().all(|part| {
        path.push(part);
        trusted(&path)
    })
}

/// Elsewhere these folders are root's (`/usr/local/texlive`): nothing to check.
#[cfg(not(windows))]
pub fn trusted_tree(_top: &Path, _dir: &Path) -> bool {
    true
}

/// Owners that can be trusted (as SID strings): the user, and what an administrator's
/// installer leaves (the Administrators group, SYSTEM, TrustedInstaller).
#[cfg_attr(not(windows), allow(dead_code))]
fn is_trusted_owner(owner: &str, user: &str) -> bool {
    const ADMINISTRATORS: &str = "S-1-5-32-544";
    const SYSTEM: &str = "S-1-5-18";
    const TRUSTED_INSTALLER: &str =
        "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
    owner == user || [ADMINISTRATORS, SYSTEM, TRUSTED_INSTALLER].contains(&owner)
}

#[cfg(windows)]
mod windows {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, LocalFree};
    use windows_sys::Win32::Security::Authorization::{
        ConvertSidToStringSidW, GetNamedSecurityInfoW, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::{
        GetTokenInformation, OWNER_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, TOKEN_QUERY,
        TOKEN_USER, TokenUser,
    };
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    use windows_sys::core::PWSTR;

    /// A SID as text (`S-1-5-…`).
    ///
    /// # Safety
    /// `sid` must be a valid SID.
    unsafe fn sid_text(sid: PSID) -> Option<String> {
        let mut text: PWSTR = std::ptr::null_mut();
        // SAFETY: `sid` is valid (the caller's promise); the string is freed below.
        unsafe {
            if ConvertSidToStringSidW(sid, &mut text) == 0 || text.is_null() {
                return None;
            }
            let len = (0..).take_while(|&i| *text.add(i) != 0).count();
            let value = String::from_utf16_lossy(std::slice::from_raw_parts(text, len));
            LocalFree(text.cast());
            Some(value)
        }
    }

    /// The owner of a file or folder (it must exist).
    pub fn owner(path: &Path) -> Option<String> {
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0]).collect();
        let mut owner: PSID = std::ptr::null_mut();
        let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
        // SAFETY: a NUL-terminated path; `owner` points into `descriptor`, which is freed
        // after reading it.
        unsafe {
            let error = GetNamedSecurityInfoW(
                wide.as_ptr(),
                SE_FILE_OBJECT,
                OWNER_SECURITY_INFORMATION,
                &mut owner,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut descriptor,
            );
            if error != 0 {
                return None;
            }
            let text = if owner.is_null() {
                None
            } else {
                sid_text(owner)
            };
            LocalFree(descriptor.cast());
            text
        }
    }

    /// The user JuTeX runs as.
    pub fn current_user() -> Option<String> {
        // SAFETY: the process token, queried into a buffer of the size it asks for and closed
        // at the end; the SID it holds is read while the buffer lives.
        unsafe {
            let mut token: HANDLE = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
                return None;
            }
            let mut size = 0;
            GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut size);
            // u64s keep the buffer aligned for TOKEN_USER.
            let mut buffer = vec![0u64; (size as usize).div_ceil(8).max(1)];
            let ok = GetTokenInformation(
                token,
                TokenUser,
                buffer.as_mut_ptr().cast(),
                size,
                &mut size,
            ) != 0;
            CloseHandle(token);
            if !ok {
                return None;
            }
            let user = &*(buffer.as_ptr() as *const TOKEN_USER);
            sid_text(user.User.Sid)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duenos_de_confianza() {
        let user = "S-1-5-21-111-222-333-1001";
        assert!(is_trusted_owner(user, user));
        assert!(is_trusted_owner("S-1-5-32-544", user), "Administradores");
        assert!(is_trusted_owner("S-1-5-18", user), "SYSTEM");
        assert!(is_trusted_owner(
            "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464",
            user
        ));
        // Another user of the same PC, or «Authenticated Users».
        assert!(!is_trusted_owner("S-1-5-21-111-222-333-1002", user));
        assert!(!is_trusted_owner("S-1-5-11", user));
    }

    #[cfg(windows)]
    #[test]
    fn carpetas_del_usuario_y_del_sistema() {
        let tmp = tempfile::TempDir::new().unwrap();
        let inner = tmp.path().join("2026").join("bin").join("windows");
        std::fs::create_dir_all(&inner).unwrap();
        // The user's own folders (as a TeX Live they installed themself).
        assert!(trusted_tree(tmp.path(), &inner));
        // An administrator's install (C:\Windows belongs to TrustedInstaller).
        let windir = std::path::PathBuf::from(std::env::var_os("SystemRoot").unwrap());
        assert!(trusted_tree(&windir, &windir.join("System32")));
        // Not under the top, or missing: not used.
        assert!(!trusted_tree(&inner, tmp.path()));
        assert!(!trusted_tree(tmp.path(), &tmp.path().join("no-existe")));
        assert!(windows::current_user().is_some_and(|sid| sid.starts_with("S-1-5-")));
    }
}
