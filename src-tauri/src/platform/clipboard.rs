//! Reading an image from the system clipboard. WebKitGTK gives the page's paste event only
//! text (an image copied from a screenshot arrives with no data), so LibreTeX reads it here
//! when the user pastes.

/// The image on the clipboard, as PNG or JPEG bytes (others are converted to PNG), or
/// `None` if there is none. Must run on the GTK main thread.
#[cfg(target_os = "linux")]
pub fn read_image() -> Option<Vec<u8>> {
    use gtk::gdk;
    let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    let targets = clipboard.wait_for_targets()?;
    let offered = |name: &str| targets.iter().any(|t| t.name() == name);
    // The bytes as they were copied, when they are a format LaTeX includes directly.
    for name in ["image/png", "image/jpeg"] {
        if offered(name)
            && let Some(data) = clipboard.wait_for_contents(&gdk::Atom::intern(name))
        {
            let bytes = data.data();
            if !bytes.is_empty() {
                return Some(bytes);
            }
        }
    }
    if !targets.iter().any(|t| t.name().starts_with("image/")) {
        return None;
    }
    // Another image format (BMP, TIFF…): converted to PNG.
    clipboard.wait_for_image()?.save_to_bufferv("png", &[]).ok()
}

#[cfg(not(target_os = "linux"))]
pub fn read_image() -> Option<Vec<u8>> {
    None
}
