use serde::{Serialize, Serializer};
use std::path::PathBuf;

/// Errors returned to the frontend. Serialized as `{ "code": "...", "message": "..." }`;
/// the frontend translates `code` and shows `message` only as technical detail.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("ruta absoluta no permitida: {0}")]
    AbsolutePath(String),
    #[error("la ruta no puede contener «..»: {0}")]
    ParentComponent(String),
    #[error("la ruta sale de la carpeta del proyecto: {0}")]
    OutsideRoot(String),
    #[error("no existe: {0}")]
    NotFound(PathBuf),
    #[error("nombre no válido «{name}»: {reason}")]
    InvalidName { name: String, reason: &'static str },
    #[error("ya existe: {0}")]
    AlreadyExists(PathBuf),
    #[error("proyecto desconocido: {0}")]
    UnknownProject(String),
    #[error("plantilla desconocida: {0}")]
    UnknownTemplate(String),
    #[error("ZIP no válido: {0}")]
    InvalidZip(String),
    #[error("no se pudo enviar a la papelera: {0}")]
    Trash(String),
    #[error("JSON no válido en {path}: {source}")]
    Json {
        path: PathBuf,
        #[source]
        source: serde_json::Error,
    },
    #[error("error de E/S en {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("no es un archivo de texto UTF-8: {0}")]
    NotText(PathBuf),
    #[error("archivo demasiado grande para abrirlo en el editor: {0}")]
    TooLarge(PathBuf),
    #[error("operación no permitida: {0}")]
    Forbidden(String),
    #[error("operación cancelada")]
    Cancelled,
    #[error("búsqueda no válida: {0}")]
    InvalidSearch(String),
    #[error("no se pudo descargar: {0}")]
    Network(String),
    #[error("no se encontró el programa «{0}»")]
    MissingTool(&'static str),
    #[error("no hay una sesión iniciada: {0}")]
    NotSignedIn(String),
    #[error("falta el autor de los respaldos (nombre y correo)")]
    NeedsIdentity,
    #[error("{0}")]
    Other(String),
}

impl AppError {
    pub fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::AbsolutePath(_) | Self::ParentComponent(_) | Self::OutsideRoot(_) => {
                "invalidPath"
            }
            Self::NotFound(_) => "notFound",
            Self::InvalidName { .. } => "invalidName",
            Self::AlreadyExists(_) => "alreadyExists",
            Self::UnknownProject(_) => "unknownProject",
            Self::UnknownTemplate(_) => "unknownTemplate",
            Self::InvalidZip(_) => "invalidZip",
            Self::Trash(_) => "trash",
            Self::Json { .. } => "invalidJson",
            Self::Io { .. } => "io",
            Self::NotText(_) => "notText",
            Self::TooLarge(_) => "tooLarge",
            Self::Forbidden(_) => "forbidden",
            Self::InvalidSearch(_) => "invalidSearch",
            Self::Cancelled => "cancelled",
            Self::Network(_) => "network",
            Self::NeedsIdentity => "needsIdentity",
            Self::MissingTool(_) => "missingTool",
            Self::NotSignedIn(_) => "notSignedIn",
            Self::Other(_) => "other",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
