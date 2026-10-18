//! Links of the «Ayuda» menu, opened in the system browser. Only these fixed addresses:
//! the webview never sends a URL.

use crate::error::{AppError, AppResult};
use tauri::AppHandle;

/// The LaTeX manual for `locale` (the wikibook, in Spanish or English).
fn latex_docs(locale: &str) -> &'static str {
    match locale {
        "es" => "https://es.wikibooks.org/wiki/Manual_de_LaTeX",
        _ => "https://en.wikibooks.org/wiki/LaTeX",
    }
}

/// Opens a help page in the browser (a network use the user asked for).
#[tauri::command]
pub fn open_help_link(app: AppHandle, topic: String, locale: String) -> AppResult<()> {
    use tauri_plugin_opener::OpenerExt;
    let url = match topic.as_str() {
        "latex" => latex_docs(&locale),
        _ => return Err(AppError::Forbidden(format!("enlace de ayuda «{topic}»"))),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manual_segun_el_idioma() {
        assert!(latex_docs("es").starts_with("https://es.wikibooks.org/"));
        assert!(latex_docs("en").starts_with("https://en.wikibooks.org/"));
        assert!(latex_docs("fr").starts_with("https://en."));
    }
}
