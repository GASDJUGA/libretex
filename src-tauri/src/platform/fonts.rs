//! The monospace font families installed, for the editor font.

/// Sorted, without repeats, hidden system fonts or emoji fonts.
fn tidy(families: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut families: Vec<String> = families
        .into_iter()
        .map(|f| f.trim().to_owned())
        .filter(|f| !f.is_empty() && !f.starts_with('.') && !f.contains("Emoji"))
        .collect();
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup();
    families
}

/// With `fc-list`; empty if unavailable.
#[cfg(not(any(target_os = "macos", windows)))]
pub fn monospace() -> Vec<String> {
    let Ok(output) = crate::platform::process::command("fc-list")
        .args([":spacing=mono", "family"])
        .output()
    else {
        return Vec::new();
    };
    tidy(
        String::from_utf8_lossy(&output.stdout)
            .lines()
            // «Noto Sans Mono,Noto Sans Mono CJK»: the first name.
            .filter_map(|line| line.split(',').next())
            .map(str::to_owned)
            .collect::<Vec<_>>(),
    )
}

/// With AppKit's font manager (fixed-pitch fonts); call it on the main thread.
#[cfg(target_os = "macos")]
pub fn monospace() -> Vec<String> {
    use objc2_app_kit::{NSFont, NSFontManager, NSFontTraitMask};
    use objc2_foundation::MainThreadMarker;

    let Some(mtm) = MainThreadMarker::new() else {
        return Vec::new();
    };
    let Some(names) = NSFontManager::sharedFontManager(mtm)
        .availableFontNamesWithTraits(NSFontTraitMask::FixedPitchFontMask)
    else {
        return Vec::new();
    };
    // PostScript names («Menlo-Bold»): their family is what CSS takes.
    tidy(
        names
            .iter()
            .filter_map(|name| NSFont::fontWithName_size(&name, 12.0)?.familyName())
            .map(|family| family.to_string())
            .collect::<Vec<_>>(),
    )
}

/// With GDI: the fixed-pitch families (as CSS names them), without raster fonts (Terminal,
/// Fixedsys), which the webview cannot use, or vertical ones (`@MS Gothic`).
#[cfg(windows)]
pub fn monospace() -> Vec<String> {
    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::Graphics::Gdi::{
        DEFAULT_CHARSET, EnumFontFamiliesExW, FIXED_PITCH, GetDC, LOGFONTW, RASTER_FONTTYPE,
        ReleaseDC, TEXTMETRICW,
    };

    unsafe extern "system" fn each(
        font: *const LOGFONTW,
        _: *const TEXTMETRICW,
        kind: u32,
        families: LPARAM,
    ) -> i32 {
        // SAFETY: GDI passes a valid LOGFONTW; `families` is the vector below.
        let (font, families) = unsafe { (&*font, &mut *(families as *mut Vec<String>)) };
        if font.lfPitchAndFamily & 0b11 == FIXED_PITCH && kind & RASTER_FONTTYPE == 0 {
            let len = font.lfFaceName.iter().position(|&c| c == 0).unwrap_or(32);
            let name = String::from_utf16_lossy(&font.lfFaceName[..len]);
            if !name.starts_with('@') {
                families.push(name);
            }
        }
        1
    }

    let mut families: Vec<String> = Vec::new();
    // SAFETY: an all-zero LOGFONTW with DEFAULT_CHARSET and no name lists every family once
    // per character set; the screen's device context is released afterwards.
    unsafe {
        let mut query: LOGFONTW = std::mem::zeroed();
        query.lfCharSet = DEFAULT_CHARSET;
        let screen = GetDC(std::ptr::null_mut());
        EnumFontFamiliesExW(
            screen,
            &query,
            Some(each),
            &mut families as *mut Vec<String> as LPARAM,
            0,
        );
        ReleaseDC(std::ptr::null_mut(), screen);
    }
    tidy(families)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordena_y_quita_repetidas() {
        let families = [
            "Menlo",
            ".SF NS Mono",
            "courier",
            "Menlo",
            "Noto Color Emoji",
            "Andale Mono",
        ];
        assert_eq!(
            tidy(families.map(String::from)),
            ["Andale Mono", "courier", "Menlo"]
        );
    }

    #[cfg(windows)]
    #[test]
    fn monoespaciadas_de_windows() {
        // Consolas and Courier New come with every Windows; Arial is proportional.
        let families = monospace();
        assert!(families.iter().any(|f| f == "Consolas"), "{families:?}");
        assert!(families.iter().any(|f| f == "Courier New"), "{families:?}");
        assert!(!families.iter().any(|f| f == "Arial"), "{families:?}");
        assert!(!families.iter().any(|f| f.starts_with('@')), "{families:?}");
    }
}
