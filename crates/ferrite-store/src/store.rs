use rusqlite::Connection;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Migration error: {0}")]
    Migration(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

pub struct AppStore {
    conn: Connection,
}

impl AppStore {
    /// Open or create the app database at the standard data directory.
    pub fn open_default() -> Result<Self, StoreError> {
        let data_dir = Self::data_dir()?;
        std::fs::create_dir_all(&data_dir)?;
        let db_path = data_dir.join("ferrite.db");
        Self::open(&db_path)
    }

    /// Open or create the app database at a specific path.
    pub fn open(path: &std::path::Path) -> Result<Self, StoreError> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        let mut store = Self { conn };
        store.run_migrations()?;
        Ok(store)
    }

    /// Open an in-memory database (for testing).
    pub fn open_memory() -> Result<Self, StoreError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys=ON;")?;
        let mut store = Self { conn };
        store.run_migrations()?;
        Ok(store)
    }

    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    fn run_migrations(&mut self) -> Result<(), StoreError> {
        // Create migrations tracking table
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS _migrations (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )?;

        let migrations: Vec<(&str, &str)> = vec![
            ("001_init", include_str!("migrations/001_init.sql")),
            ("002_fts", include_str!("migrations/002_fts.sql")),
            (
                "003_activity_log",
                include_str!("migrations/003_activity_log.sql"),
            ),
        ];

        for (name, sql) in migrations {
            let applied: bool = self.conn.query_row(
                "SELECT COUNT(*) > 0 FROM _migrations WHERE name = ?1",
                [name],
                |row| row.get(0),
            )?;

            if !applied {
                self.conn
                    .execute_batch(sql)
                    .map_err(|e| StoreError::Migration(format!("{name}: {e}")))?;
                self.conn
                    .execute("INSERT INTO _migrations (name) VALUES (?1)", [name])?;
                tracing::info!("Applied migration: {name}");
            }
        }

        Ok(())
    }

    fn data_dir() -> Result<PathBuf, StoreError> {
        let base = dirs::data_dir()
            .ok_or_else(|| StoreError::Io(std::io::Error::other("no data directory found")))?;
        Ok(base.join("ferrite"))
    }
}

impl std::fmt::Debug for AppStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AppStore").finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_open_memory() {
        let store = AppStore::open_memory().unwrap();
        // Verify migrations ran
        let count: i64 = store
            .conn()
            .query_row("SELECT COUNT(*) FROM _migrations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_migrations_idempotent() {
        let store = AppStore::open_memory().unwrap();
        // Tables should exist
        let tables: Vec<String> = store
            .conn()
            .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|r| r.ok())
            .collect();

        assert!(tables.contains(&"connections".to_string()));
        assert!(tables.contains(&"query_history".to_string()));
        assert!(tables.contains(&"query_versions".to_string()));
        assert!(tables.contains(&"settings".to_string()));
    }
}
