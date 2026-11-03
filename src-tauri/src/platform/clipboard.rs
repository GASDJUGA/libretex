//! Reading an image from the system clipboard. WebKitGTK gives the page's paste event only
//! text (an image copied from a screenshot arrives with no data), so LibreTeX reads it here
//! when the user pastes; on macOS too, so the bytes never travel through the webview.

/// An image read from the clipboard.
// Without a clipboard reader (Windows, for now) no image is ever read.
#[cfg_attr(not(any(target_os = "linux", target_os = "macos")), allow(dead_code))]
pub enum Pasted {
    /// PNG or JPEG bytes.
    Ready(Vec<u8>),
    /// TIFF bytes (macOS: what Preview copies), to convert to PNG.
    #[cfg(target_os = "macos")]
    Tiff(Vec<u8>),
}

impl Pasted {
    /// PNG or JPEG bytes. Converting a large image takes a while (a TIFF of a Retina screen,
    /// ~45 ms): call it off the main thread.
    pub fn into_bytes(self) -> Option<Vec<u8>> {
        match self {
            Pasted::Ready(bytes) => Some(bytes),
            #[cfg(target_os = "macos")]
            Pasted::Tiff(tiff) => tiff_to_png(&tiff),
        }
    }
}

/// The image on the clipboard, as PNG or JPEG bytes (others are converted to PNG), or
/// `None` if there is none. Must run on the GTK main thread.
#[cfg(target_os = "linux")]
pub fn read_image() -> Option<Pasted> {
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
                return Some(Pasted::Ready(bytes));
            }
        }
    }
    if !targets.iter().any(|t| t.name().starts_with("image/")) {
        return None;
    }
    // Another image format (BMP, TIFF…): converted to PNG.
    let png = clipboard
        .wait_for_image()?
        .save_to_bufferv("png", &[])
        .ok()?;
    Some(Pasted::Ready(png))
}

/// The image on the pasteboard: PNG or JPEG bytes as copied, or TIFF to convert. Only reads
/// (AppKit's pasteboard is used on the main thread); the conversion is `Pasted::into_bytes`.
#[cfg(target_os = "macos")]
pub fn read_image() -> Option<Pasted> {
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypePNG, NSPasteboardTypeTIFF};
    use objc2_foundation::NSString;

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
        return Some(Pasted::Ready(bytes));
    }
    // A screenshot or an image copied from Preview often comes only as TIFF.
    read(tiff).map(Pasted::Tiff)
}

/// TIFF bytes converted to PNG (on any thread: the image representation is not shared).
#[cfg(target_os = "macos")]
fn tiff_to_png(tiff: &[u8]) -> Option<Vec<u8>> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
    use objc2_foundation::{NSData, NSDictionary};

    let rep = NSBitmapImageRep::imageRepWithData(&NSData::with_bytes(tiff))?;
    // SAFETY: an empty dictionary of properties is valid for any file type.
    let png = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }?;
    Some(png.to_vec())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
pub fn read_image() -> Option<Pasted> {
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

    /// A TIFF (what Preview copies) becomes a PNG of the same image, outside the main thread.
    #[test]
    fn convierte_tiff_a_png_en_otro_hilo() {
        let rep = NSBitmapImageRep::imageRepWithData(&NSData::with_bytes(PNG)).unwrap();
        let tiff = rep.TIFFRepresentation().unwrap().to_vec();
        let png = std::thread::spawn(move || Pasted::Tiff(tiff).into_bytes())
            .join()
            .unwrap()
            .unwrap();
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        let back = NSBitmapImageRep::imageRepWithData(&NSData::with_bytes(&png)).unwrap();
        assert_eq!(
            (back.pixelsWide(), back.pixelsHigh()),
            (rep.pixelsWide(), rep.pixelsHigh())
        );
    }

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
        let read = || read_image().and_then(Pasted::into_bytes);
        assert_eq!(read().as_deref(), Some(PNG));

        // Only TIFF (like an image copied from Preview): converted to PNG.
        let rep = NSBitmapImageRep::imageRepWithData(&NSData::with_bytes(PNG)).unwrap();
        let tiff_bytes = rep.TIFFRepresentation().unwrap();
        pasteboard.clearContents();
        assert!(pasteboard.setData_forType(Some(&tiff_bytes), tiff));
        let converted = read().unwrap();
        assert!(converted.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(crate::files::images::ImageKind::of(&converted).is_some());

        // Text only: no image.
        pasteboard.clearContents();
        pasteboard.setString_forType(&objc2_foundation::NSString::from_str("hola"), unsafe {
            objc2_app_kit::NSPasteboardTypeString
        });
        assert!(read_image().is_none());
    }
}
