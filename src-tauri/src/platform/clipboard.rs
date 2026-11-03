//! Reading an image from the system clipboard. WebKitGTK gives the page's paste event only
//! text (an image copied from a screenshot arrives with no data), so LibreTeX reads it here
//! when the user pastes; on macOS and Windows too, so the bytes never travel through the
//! webview.

/// An image read from the clipboard.
// Without a clipboard reader (other systems) no image is ever read.
#[cfg_attr(
    not(any(target_os = "linux", target_os = "macos", windows)),
    allow(dead_code)
)]
pub enum Pasted {
    /// PNG or JPEG bytes.
    Ready(Vec<u8>),
    /// TIFF bytes (macOS: what Preview copies), to convert to PNG.
    #[cfg(target_os = "macos")]
    Tiff(Vec<u8>),
    /// A packed DIB (Windows: what Print Screen and most programs copy), to convert to PNG.
    #[cfg(windows)]
    Dib(Vec<u8>),
}

impl Pasted {
    /// PNG or JPEG bytes. Converting a large image takes a while (a TIFF of a Retina screen,
    /// ~45 ms): call it off the main thread.
    pub fn into_bytes(self) -> Option<Vec<u8>> {
        match self {
            Pasted::Ready(bytes) => Some(bytes),
            #[cfg(target_os = "macos")]
            Pasted::Tiff(tiff) => tiff_to_png(&tiff),
            #[cfg(windows)]
            Pasted::Dib(dib) => windows::dib_to_png(&dib),
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

/// The image on the clipboard: PNG or JPEG bytes as copied, or the bitmap a screenshot leaves,
/// to convert (`Pasted::into_bytes`).
#[cfg(windows)]
pub fn read_image() -> Option<Pasted> {
    windows::read_image()
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
pub fn read_image() -> Option<Pasted> {
    None
}

#[cfg(windows)]
mod windows {
    use super::Pasted;
    use std::time::Duration;
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        RegisterClipboardFormatW,
    };
    use windows_sys::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};

    /// Standard clipboard formats (WinUser.h).
    pub(super) const CF_DIB: u32 = 8;
    const CF_DIBV5: u32 = 17;

    /// Larger bitmaps are not pasted (the saved file could not pass 50 MB anyway).
    const MAX_PIXELS: u64 = 64 * 1024 * 1024;

    /// Only reads (and closes the clipboard soon); the conversion is `Pasted::into_bytes`.
    pub fn read_image() -> Option<Pasted> {
        let _open = Open::new()?;
        // The bytes as they were copied (browsers, the Snipping Tool), when LaTeX takes them.
        if let Some(bytes) = data(registered("PNG")).or_else(|| data(registered("JFIF"))) {
            return Some(Pasted::Ready(bytes));
        }
        // A bitmap (Print Screen and most programs). Windows offers each one in both forms;
        // the V5 one keeps the transparency of programs that set it.
        data(CF_DIBV5).or_else(|| data(CF_DIB)).map(Pasted::Dib)
    }

    /// The clipboard, open until dropped.
    struct Open;

    impl Open {
        fn new() -> Option<Open> {
            // Another program may be holding it for a moment.
            for _ in 0..10 {
                // SAFETY: no window owns it; closed on drop.
                if unsafe { OpenClipboard(std::ptr::null_mut()) } != 0 {
                    return Some(Open);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            None
        }
    }

    impl Drop for Open {
        fn drop(&mut self) {
            // SAFETY: opened by `Open::new`.
            unsafe { CloseClipboard() };
        }
    }

    fn registered(name: &str) -> u32 {
        let wide: Vec<u16> = name.encode_utf16().chain([0]).collect();
        // SAFETY: a NUL-terminated UTF-16 string.
        unsafe { RegisterClipboardFormatW(wide.as_ptr()) }
    }

    /// A copy of the clipboard's `format` (a memory format), if it holds one.
    fn data(format: u32) -> Option<Vec<u8>> {
        // SAFETY: the clipboard is open (`Open`); the handle of a memory format is an
        // HGLOBAL, locked while it is copied and owned by the clipboard.
        unsafe {
            if format == 0 || IsClipboardFormatAvailable(format) == 0 {
                return None;
            }
            let handle = GetClipboardData(format);
            if handle.is_null() {
                return None;
            }
            let size = GlobalSize(handle);
            let start = GlobalLock(handle) as *const u8;
            if start.is_null() {
                return None;
            }
            let bytes = std::slice::from_raw_parts(start, size).to_vec();
            GlobalUnlock(handle);
            (!bytes.is_empty()).then_some(bytes)
        }
    }

    fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
        Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
    }

    fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
        Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
    }

    /// One 8-bit channel of a 32-bit pixel, by its mask (`None` if it is not 8 bits).
    fn channel(mask: u32) -> Option<u32> {
        (mask.count_ones() == 8 && (mask >> mask.trailing_zeros()) == 0xFF)
            .then(|| mask.trailing_zeros())
    }

    /// A packed DIB (`BITMAPINFOHEADER` or a later header, then the pixels) of 24 or 32 bits
    /// per pixel as a PNG; `None` for other kinds (palettes, compressed) or broken data.
    pub(super) fn dib_to_png(dib: &[u8]) -> Option<Vec<u8>> {
        const BI_RGB: u32 = 0;
        const BI_BITFIELDS: u32 = 3;
        let header = u32_at(dib, 0)? as usize;
        let width = i32::try_from(u32_at(dib, 4)?).ok()?;
        let height = u32_at(dib, 8)? as i32;
        let bits = u16_at(dib, 14)?;
        let compression = u32_at(dib, 16)?;
        let palette = u32_at(dib, 32)? as usize;
        if header < 40 || width <= 0 || height == 0 || !matches!(bits, 24 | 32) {
            return None;
        }
        let (width, rows) = (width as usize, height.unsigned_abs() as usize);
        if (width as u64) * (rows as u64) > MAX_PIXELS {
            return None;
        }
        // Red, green, blue and alpha masks of a 32-bit pixel.
        let (masks, after_header) = match (bits, compression) {
            (_, BI_RGB) => ([0xFF_0000, 0xFF00, 0xFF, 0xFF00_0000], 0),
            (32, BI_BITFIELDS) if header == 40 => {
                // The masks follow a plain header; no alpha.
                let mask = |i: usize| u32_at(dib, 40 + 4 * i);
                ([mask(0)?, mask(1)?, mask(2)?, 0], 12)
            }
            (32, BI_BITFIELDS) => {
                // Inside a V4/V5 header.
                let mask = |i: usize| u32_at(dib, 40 + 4 * i);
                ([mask(0)?, mask(1)?, mask(2)?, mask(3)?], 0)
            }
            _ => return None,
        };
        let shifts = [
            channel(masks[0])?,
            channel(masks[1])?,
            channel(masks[2])?,
            if masks[3] == 0 { 0 } else { channel(masks[3])? },
        ];
        let start = header + after_header + palette * 4;
        let stride = (width * bits as usize).div_ceil(32) * 4;
        let pixels = dib.get(start..start.checked_add(stride.checked_mul(rows)?)?)?;

        let mut rgba = Vec::with_capacity(width * rows * 4);
        for y in 0..rows {
            // Bottom-up unless the height is negative.
            let row = if height < 0 { y } else { rows - 1 - y };
            let row = &pixels[row * stride..][..stride];
            for x in 0..width {
                if bits == 24 {
                    let bgr = &row[x * 3..];
                    rgba.extend([bgr[2], bgr[1], bgr[0], 0xFF]);
                } else {
                    let v = u32::from_le_bytes(row[x * 4..x * 4 + 4].try_into().ok()?);
                    let at = |i: usize| ((v & masks[i]) >> shifts[i]) as u8;
                    let alpha = if masks[3] == 0 { 0xFF } else { at(3) };
                    rgba.extend([at(0), at(1), at(2), alpha]);
                }
            }
        }
        // Most programs leave the fourth byte at 0 without meaning transparency: an image all
        // transparent is taken as opaque. Opaque images are saved without alpha.
        let alpha = rgba.chunks(4).map(|p| p[3]);
        let opaque = alpha.clone().all(|a| a == 0xFF) || alpha.clone().all(|a| a == 0);
        let (data, color) = if opaque {
            let rgb = rgba.chunks(4).flat_map(|p| [p[0], p[1], p[2]]).collect();
            (rgb, png::ColorType::Rgb)
        } else {
            (rgba, png::ColorType::Rgba)
        };

        let mut out = Vec::new();
        let mut encoder = png::Encoder::new(&mut out, width as u32, rows as u32);
        encoder.set_color(color);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.write_header().ok()?.write_image_data(&data).ok()?;
        Some(out)
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::windows::{CF_DIB, dib_to_png};

    /// A `BITMAPINFOHEADER` (40 bytes) of `width × height` pixels.
    fn header(width: i32, height: i32, bits: u16, compression: u32) -> Vec<u8> {
        let mut h = Vec::new();
        h.extend(40u32.to_le_bytes());
        h.extend(width.to_le_bytes());
        h.extend(height.to_le_bytes());
        h.extend(1u16.to_le_bytes());
        h.extend(bits.to_le_bytes());
        h.extend(compression.to_le_bytes());
        h.extend([0; 20]);
        h
    }

    /// The PNG's size, color type and pixels.
    fn decode(png: &[u8]) -> (u32, u32, png::ColorType, Vec<u8>) {
        let mut reader = png::Decoder::new(std::io::Cursor::new(png))
            .read_info()
            .unwrap();
        let mut buf = vec![0; reader.output_buffer_size().unwrap()];
        let info = reader.next_frame(&mut buf).unwrap();
        buf.truncate(info.buffer_size());
        (info.width, info.height, info.color_type, buf)
    }

    #[test]
    fn mapa_de_24_bits_de_abajo_arriba_con_relleno() {
        // 2 × 2, rows of 6 bytes padded to 8; the first row in memory is the bottom one.
        let mut dib = header(2, 2, 24, 0);
        dib.extend([0, 0, 255, 0, 255, 0, 0, 0]); // bottom: red, green
        dib.extend([255, 0, 0, 255, 255, 255, 0, 0]); // top: blue, white
        let (w, h, color, pixels) = decode(&dib_to_png(&dib).unwrap());
        assert_eq!((w, h, color), (2, 2, png::ColorType::Rgb));
        assert_eq!(pixels, [0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0]);
    }

    #[test]
    fn mapa_de_32_bits_de_arriba_abajo() {
        // The fourth byte at 0 everywhere (as most programs leave it): opaque.
        let mut dib = header(1, -2, 32, 0);
        dib.extend([10, 20, 30, 0, 40, 50, 60, 0]);
        let (_, _, color, pixels) = decode(&dib_to_png(&dib).unwrap());
        assert_eq!(color, png::ColorType::Rgb);
        assert_eq!(pixels, [30, 20, 10, 60, 50, 40]);

        // With real transparency, kept.
        let mut dib = header(1, -2, 32, 0);
        dib.extend([10, 20, 30, 255, 40, 50, 60, 128]);
        let (_, _, color, pixels) = decode(&dib_to_png(&dib).unwrap());
        assert_eq!(color, png::ColorType::Rgba);
        assert_eq!(pixels, [30, 20, 10, 255, 60, 50, 40, 128]);
    }

    #[test]
    fn mascaras_tras_la_cabecera() {
        // BI_BITFIELDS with the masks after a plain header: here red in the low byte.
        let mut dib = header(1, 1, 32, 3);
        for mask in [0xFFu32, 0xFF00, 0xFF_0000] {
            dib.extend(mask.to_le_bytes());
        }
        dib.extend([1, 2, 3, 0]);
        let (_, _, _, pixels) = decode(&dib_to_png(&dib).unwrap());
        assert_eq!(pixels, [1, 2, 3]);
    }

    #[test]
    fn rechaza_lo_que_no_sabe_leer() {
        let mut short = header(4, 4, 24, 0);
        short.extend([0; 10]);
        assert_eq!(dib_to_png(&short), None, "faltan píxeles");
        assert_eq!(dib_to_png(&header(1, 1, 8, 0)), None, "paleta");
        assert_eq!(dib_to_png(&header(1, 1, 24, 1)), None, "comprimido");
        assert_eq!(dib_to_png(&header(0, 1, 24, 0)), None, "sin ancho");
        assert_eq!(dib_to_png(&[1, 2, 3]), None);
    }

    /// Uses the real clipboard (replaces what the user copied). Ignored by default; run with
    /// `cargo test -- --ignored portapapeles_de_windows`.
    #[test]
    #[ignore]
    fn portapapeles_de_windows() {
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
        };
        use windows_sys::Win32::System::Memory::{
            GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock,
        };
        // A 3 × 1 bitmap, as Print Screen leaves it.
        let mut dib = header(3, 1, 24, 0);
        dib.extend([0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0]);
        // SAFETY: the clipboard takes ownership of the memory handed to it.
        unsafe {
            assert_ne!(OpenClipboard(std::ptr::null_mut()), 0);
            EmptyClipboard();
            let memory = GlobalAlloc(GMEM_MOVEABLE, dib.len());
            let target = GlobalLock(memory) as *mut u8;
            std::ptr::copy_nonoverlapping(dib.as_ptr(), target, dib.len());
            GlobalUnlock(memory);
            assert!(!SetClipboardData(CF_DIB, memory).is_null());
            CloseClipboard();
        }
        let pasted = super::read_image().expect("una imagen");
        let (w, h, _, pixels) = decode(&pasted.into_bytes().expect("convertida a PNG"));
        assert_eq!((w, h), (3, 1));
        assert_eq!(pixels, [255, 0, 0, 0, 255, 0, 0, 0, 255]);
    }
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
