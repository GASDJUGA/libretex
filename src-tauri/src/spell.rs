//! The user's personal dictionary (`~/.config/libretex/dictionary.txt`): words the spell
//! checker accepts in every project, one per line. Checking itself happens in the webview
//! (nspell with bundled Hunspell dictionaries).

use crate::error::{AppError, AppResult};
use crate::util::fs::atomic_write;
use std::fs;
use std::path::Path;

/// Longest word accepted (in characters).
const MAX_WORD_CHARS: usize = 64;

/// A word that can be added: letters and the marks found inside words, no spaces.
pub fn validate_word(word: &str) -> AppResult<()> {
    let chars = word.chars().count();
    let ok = (1..=MAX_WORD_CHARS).contains(&chars)
        && word.chars().any(char::is_alphabetic)
        && word
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '\'' | '’' | '-' | '.'));
    if ok {
        Ok(())
    } else {
        Err(AppError::InvalidName {
            name: word.to_owned(),
            reason: "no es una palabra",
        })
    }
}

/// The words of the dictionary (empty if it does not exist yet), without repetitions.
pub fn read_words(path: &Path) -> AppResult<Vec<String>> {
    let text = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(AppError::io(path, e)),
    };
    let mut words: Vec<String> = text
        .lines()
        .map(str::trim)
        .filter(|w| validate_word(w).is_ok())
        .map(str::to_owned)
        .collect();
    words.sort();
    words.dedup();
    Ok(words)
}

fn write_words(path: &Path, words: &[String]) -> AppResult<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| AppError::io(dir, e))?;
    }
    let mut text = words.join("\n");
    text.push('\n');
    atomic_write(path, text.as_bytes())
}

/// Adds `word`; returns the dictionary.
pub fn add_word(path: &Path, word: &str) -> AppResult<Vec<String>> {
    validate_word(word)?;
    let mut words = read_words(path)?;
    if let Err(at) = words.binary_search_by(|w| w.as_str().cmp(word)) {
        words.insert(at, word.to_owned());
        write_words(path, &words)?;
    }
    Ok(words)
}

/// Removes `word`; returns the dictionary.
pub fn remove_word(path: &Path, word: &str) -> AppResult<Vec<String>> {
    let mut words = read_words(path)?;
    if let Ok(at) = words.binary_search_by(|w| w.as_str().cmp(word)) {
        words.remove(at);
        write_words(path, &words)?;
    }
    Ok(words)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn agrega_y_quita_palabras_ordenadas_sin_repetir() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config/dictionary.txt");
        assert!(read_words(&path).unwrap().is_empty());
        add_word(&path, "Coulomb").unwrap();
        add_word(&path, "autovalores").unwrap();
        let words = add_word(&path, "Coulomb").unwrap();
        assert_eq!(words, ["Coulomb", "autovalores"]);
        assert_eq!(fs::read_to_string(&path).unwrap(), "Coulomb\nautovalores\n");
        assert_eq!(remove_word(&path, "Coulomb").unwrap(), ["autovalores"]);
        assert_eq!(remove_word(&path, "no-está").unwrap(), ["autovalores"]);
    }

    #[test]
    fn solo_palabras() {
        for ok in ["tensión", "don't", "Navier-Stokes", "etc.", "H2O"] {
            assert!(validate_word(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "dos palabras",
            "a\nb",
            "123",
            "\\frac",
            "x{y}",
            &"a".repeat(65),
        ] {
            assert!(validate_word(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn un_archivo_editado_a_mano_se_lee_limpio() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("dictionary.txt");
        fs::write(&path, "  beta\nalfa\n\nalfa\ndos palabras\n").unwrap();
        assert_eq!(read_words(&path).unwrap(), ["alfa", "beta"]);
    }
}
