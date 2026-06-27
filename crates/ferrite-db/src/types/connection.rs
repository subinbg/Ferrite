use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DatabaseDialect {
    PostgreSQL,
    SQLite,
}

impl std::fmt::Display for DatabaseDialect {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PostgreSQL => write!(f, "postgresql"),
            Self::SQLite => write!(f, "sqlite"),
        }
    }
}

/// Resolved connection parameters — no URL encoding, passed directly to drivers.
#[derive(Debug, Clone)]
pub struct ConnectParams {
    pub dialect: DatabaseDialect,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    pub password: Option<String>,
    pub ssl_mode: String,
}
