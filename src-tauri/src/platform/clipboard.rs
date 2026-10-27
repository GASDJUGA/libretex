//! Reading an image from the system clipboard. WebKitGTK gives the page's paste event only
//! text (an image copied from a screenshot arrives with no data), so LibreTeX reads it here
//! when the user pastes; on macOS too, so the bytes never travel through the webview.

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

/// The image on the pasteboard, as PNG or JPEG bytes (TIFF and other images are converted to
/// PNG), or `None` if there is none.
#[cfg(target_os = "macos")]
pub fn read_image() -> Option<Vec<u8>> {
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSPasteboard, NSPasteboardTypePNG,
        NSPasteboardTypeTIFF,
    };
    use objc2_foundation::{NSDictionary, NSString};

    let pasteboard = NSPasteboard::generalPasteboard();
    let read = |kind: &NSString| {
        pasteboard
            .dataForType(kind)
            .map(|data| data.to_vec())
            .filter(|bytes| !bytes.is_empty())
    };
    // SAFETY: AppKit's constant pasteboard type strings, valid for the life of the process.
    let (png, tiff) = unsafe { (NSPasteboardTypePNG, NSPasteboardTypeTIFF) };
    // The bytes as they were copied, when they are a format LaTeX includes directly.
    if let Some(bytes) = read(png).or_else(|| read(&NSString::from_str("public.jpeg"))) {
        return Some(bytes);
    }
    // A screenshot or an image copied from Preview often comes only as TIFF: converted to PNG.
    let tiff = pasteboard.dataForType(tiff)?;
    let rep = NSBitmapImageRep::imageRepWithData(&tiff)?;
    // SAFETY: an empty dictionary of properties is valid for any file type.
    let png = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }?;
    Some(png.to_vec())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub fn read_image() -> Option<Vec<u8>> {
    None
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use objc2_app_kit::{
        NSBitmapImageRep, NSPasteboard, NSPasteboardTypePNG, NSPasteboardTypeTIFF,
    };
    use objc2_foundation::NSData;

    const PNG: &[u8] = include_bytes!("../../icons/Square30x30Logo.png");

    /// Uses the real pasteboard (replaces what the user copied). Ignored by default; run with
    /// `cargo test -- --ignored portapapeles_de_macos`.
    #[test]
    #[ignore]
    fn portapapeles_de_macos() {
        let pasteboard = NSPasteboard::generalPasteboard();
        let (png, tiff) = unsafe { (NSPasteboardTypePNG, NSPasteboardTypeTIFF) };

        // A PNG comes back as it was copied.
        pasteboard.clearContents();
        assert!(pasteboard.setData_forType(Some(&NSData::with_bytes(PNG)), png));
        assert_eq!(read_image().as_deref(), Some(PNG));

        // Only TIFF (like an image copied from Preview): converted to PNG.
        let rep = NSBitmapImageRep::imageRepWithData(&NSData::with_bytes(PNG)).unwrap();
        let tiff_bytes = rep.TIFFRepresentation().unwrap();
        pasteboard.clearContents();
        assert!(pasteboard.setData_forType(Some(&tiff_bytes), tiff));
        let read = read_image().unwrap();
        assert!(read.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(crate::files::images::ImageKind::of(&read).is_some());

        // Text only: no image.
        pasteboard.clearContents();
        pasteboard.setString_forType(&objc2_foundation::NSString::from_str("hola"), unsafe {
            objc2_app_kit::NSPasteboardTypeString
        });
        assert_eq!(read_image(), None);
    }
}
