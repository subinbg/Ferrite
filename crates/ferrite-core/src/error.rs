use thiserror::Error;

#[derive(Error, Debug)]
pub enum FerriteError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Authentication error: {0}")]
    Auth(String),

    #[error("Encryption error: {0}")]
    Crypto(String),

    #[error("Export error: {0}")]
    Export(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Query cancelled")]
    QueryCancelled,

    #[error("Query timeout after {0}s")]
    QueryTimeout(u64),

    #[error("{0}")]
    Internal(String),
}

impl FerriteError {
    pub fn status_code(&self) -> u16 {
        match self {
            Self::NotFound(_) => 404,
            Self::Auth(_) => 401,
            Self::Validation(_) => 400,
            Self::QueryCancelled => 499,
            Self::QueryTimeout(_) => 408,
            _ => 500,
        }
    }
}
