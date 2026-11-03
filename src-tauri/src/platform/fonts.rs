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

/// The families of the fixed-pitch fonts, with Core Text. Unlike AppKit's font manager, which
/// only works on the main thread (where its first query froze the window ~200 ms), Core Text
/// answers from any thread, and in ~10 ms.
#[cfg(target_os = "macos")]
pub fn monospace() -> Vec<String> {
    use objc2_core_foundation::{
        CFArray, CFDictionary, CFNumber, CFSet, CFString, CFType, kCFTypeSetCallBacks,
    };
    use objc2_core_text::{
        CTFontDescriptor, CTFontSymbolicTraits, kCTFontFamilyNameAttribute, kCTFontSymbolicTrait,
        kCTFontTraitsAttribute,
    };

    // SAFETY: Core Text's constant attribute names, valid for the life of the process.
    let (traits_key, symbolic_key, family_key) = unsafe {
        (
            kCTFontTraitsAttribute,
            kCTFontSymbolicTrait,
            kCTFontFamilyNameAttribute,
        )
    };
    // «Fonts whose traits include monospace» (the same flag as AppKit's fixed pitch).
    let mono = CFNumber::new_i64(i64::from(CTFontSymbolicTraits::TraitMonoSpace.bits()));
    let traits = CFDictionary::<CFString, CFType>::from_slices(&[symbolic_key], &[&mono]);
    let attributes = CFDictionary::<CFString, CFType>::from_slices(&[traits_key], &[&traits]);
    let mut mandatory = [(traits_key as *const CFString).cast()];
    // SAFETY: the attributes dictionary has CFString keys and CF values, as Core Text expects;
    // the set holds one CFString with CF's own callbacks.
    let matches = unsafe {
        let descriptor = CTFontDescriptor::with_attributes(attributes.as_ref());
        let mandatory = CFSet::new(None, mandatory.as_mut_ptr(), 1, &kCFTypeSetCallBacks);
        descriptor.matching_font_descriptors(mandatory.as_deref())
    };
    let Some(matches) = matches else {
        return Vec::new();
    };
    // SAFETY: the matches are font descriptors.
    let matches: &CFArray<CTFontDescriptor> = unsafe { matches.cast_unchecked() };
    tidy(
        matches
            .iter()
            // SAFETY: a valid attribute name for any descriptor.
            .filter_map(|descriptor| unsafe { descriptor.attribute(family_key) })
            .filter_map(|family| family.downcast::<CFString>().ok())
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

    /// Menlo comes with every macOS; Helvetica is proportional. Runs outside the main thread,
    /// as the command does.
    #[cfg(target_os = "macos")]
    #[test]
    fn monoespaciadas_de_macos_desde_otro_hilo() {
        let families = std::thread::spawn(monospace).join().unwrap();
        assert!(families.iter().any(|f| f == "Menlo"), "{families:?}");
        assert!(!families.iter().any(|f| f == "Helvetica"), "{families:?}");
    }
}
