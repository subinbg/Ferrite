use crate::store::{AppStore, StoreError};
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VersionRecord {
    pub id: String,
    pub connection_id: Option<String>,
    pub title: String,
    pub sql_text: String,
    pub version: i64,
    pub parent_id: Option<String>,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct NewVersion {
    pub connection_id: Option<String>,
    pub title: String,
    pub sql_text: String,
    pub parent_id: Option<String>,
    pub label: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct VersionUpdate {
    pub label: Option<String>,
    pub notes: Option<String>,
}

impl AppStore {
    pub fn create_version(&self, v: &NewVersion) -> Result<VersionRecord, StoreError> {
        let id = Uuid::new_v4().to_string();

        // Auto-increment version number for the same title
        let next_version: i64 = self
            .conn()
            .query_row(
                "SELECT COALESCE(MAX(version), 0) + 1 FROM query_versions WHERE title = ?1",
                [&v.title],
                |row| row.get(0),
            )
            .unwrap_or(1);

        self.conn().execute(
            "INSERT INTO query_versions (id, connection_id, title, sql_text, version, parent_id, label, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, v.connection_id, v.title, v.sql_text, next_version, v.parent_id, v.label, v.notes],
        )?;

        self.get_version(&id)
    }

    pub fn get_version(&self, id: &str) -> Result<VersionRecord, StoreError> {
        self.conn()
            .query_row(
                "SELECT id, connection_id, title, sql_text, version, parent_id, label, notes, created_at
                 FROM query_versions WHERE id = ?1",
                [id],
                |row| Ok(VersionRecord {
                    id: row.get(0)?,
                    connection_id: row.get(1)?,
                    title: row.get(2)?,
                    sql_text: row.get(3)?,
                    version: row.get(4)?,
                    parent_id: row.get(5)?,
                    label: row.get(6)?,
                    notes: row.get(7)?,
                    created_at: row.get(8)?,
                }),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => StoreError::NotFound(format!("version {id}")),
                other => StoreError::Db(other),
            })
    }

    pub fn list_versions(
        &self,
        search: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<VersionRecord>, StoreError> {
        if let Some(query) = search {
            let mut stmt = self.conn().prepare(
                "SELECT v.id, v.connection_id, v.title, v.sql_text, v.version, v.parent_id, v.label, v.notes, v.created_at
                 FROM query_versions v
                 JOIN query_versions_fts f ON v.rowid = f.rowid
                 WHERE query_versions_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(rusqlite::params![query, limit as i64, offset as i64], map_version)?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db);
        }

        let mut stmt = self.conn().prepare(
            "SELECT id, connection_id, title, sql_text, version, parent_id, label, notes, created_at
             FROM query_versions ORDER BY created_at DESC LIMIT ?1 OFFSET ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit as i64, offset as i64], map_version)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db)
    }

    pub fn update_version(&self, id: &str, update: &VersionUpdate) -> Result<VersionRecord, StoreError> {
        self.conn().execute(
            "UPDATE query_versions SET label = COALESCE(?1, label), notes = COALESCE(?2, notes) WHERE id = ?3",
            rusqlite::params![update.label, update.notes, id],
        )?;
        self.get_version(id)
    }

    pub fn delete_version(&self, id: &str) -> Result<bool, StoreError> {
        let affected = self.conn().execute("DELETE FROM query_versions WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }
}

fn map_version(row: &rusqlite::Row) -> rusqlite::Result<VersionRecord> {
    Ok(VersionRecord {
        id: row.get(0)?,
        connection_id: row.get(1)?,
        title: row.get(2)?,
        sql_text: row.get(3)?,
        version: row.get(4)?,
        parent_id: row.get(5)?,
        label: row.get(6)?,
        notes: row.get(7)?,
        created_at: row.get(8)?,
    })
}
