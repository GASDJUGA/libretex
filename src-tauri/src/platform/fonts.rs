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
#[cfg(not(target_os = "macos"))]
pub fn monospace() -> Vec<String> {
    let Ok(output) = std::process::Command::new("fc-list")
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
}
