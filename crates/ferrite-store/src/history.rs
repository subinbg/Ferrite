use crate::store::{AppStore, StoreError};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct NewHistoryEntry {
    pub connection_id: String,
    pub sql_text: String,
    pub dialect: String,
    pub status: String,
    pub error_message: Option<String>,
    pub row_count: Option<i64>,
    pub duration_ms: Option<i64>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct HistoryRecord {
    pub id: String,
    pub connection_id: String,
    pub sql_text: String,
    pub dialect: String,
    pub status: String,
    pub error_message: Option<String>,
    pub row_count: Option<i64>,
    pub duration_ms: Option<i64>,
    pub executed_at: String,
}

impl AppStore {
    pub fn insert_history(&self, entry: &NewHistoryEntry) -> Result<HistoryRecord, StoreError> {
        let id = Uuid::new_v4().to_string();
        self.conn().execute(
            "INSERT INTO query_history (id, connection_id, sql_text, dialect, status, error_message, row_count, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                id,
                entry.connection_id,
                entry.sql_text,
                entry.dialect,
                entry.status,
                entry.error_message,
                entry.row_count,
                entry.duration_ms,
            ],
        )?;

        self.conn()
            .query_row(
                "SELECT id, connection_id, sql_text, dialect, status, error_message, row_count, duration_ms, executed_at
                 FROM query_history WHERE id = ?1",
                [&id],
                |row| {
                    Ok(HistoryRecord {
                        id: row.get(0)?,
                        connection_id: row.get(1)?,
                        sql_text: row.get(2)?,
                        dialect: row.get(3)?,
                        status: row.get(4)?,
                        error_message: row.get(5)?,
                        row_count: row.get(6)?,
                        duration_ms: row.get(7)?,
                        executed_at: row.get(8)?,
                    })
                },
            )
            .map_err(StoreError::Db)
    }

    pub fn list_history(
        &self,
        connection_id: Option<&str>,
        search: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<HistoryRecord>, StoreError> {
        if let Some(query) = search {
            // FTS5 search
            let mut stmt = self.conn().prepare(
                "SELECT h.id, h.connection_id, h.sql_text, h.dialect, h.status,
                        h.error_message, h.row_count, h.duration_ms, h.executed_at
                 FROM query_history h
                 JOIN query_history_fts f ON h.rowid = f.rowid
                 WHERE query_history_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(rusqlite::params![query, limit as i64, offset as i64], |row| {
                Ok(HistoryRecord {
                    id: row.get(0)?,
                    connection_id: row.get(1)?,
                    sql_text: row.get(2)?,
                    dialect: row.get(3)?,
                    status: row.get(4)?,
                    error_message: row.get(5)?,
                    row_count: row.get(6)?,
                    duration_ms: row.get(7)?,
                    executed_at: row.get(8)?,
                })
            })?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db);
        }

        let (sql, params): (String, Vec<Box<dyn rusqlite::types::ToSql>>) = if let Some(cid) = connection_id {
            (
                "SELECT id, connection_id, sql_text, dialect, status, error_message, row_count, duration_ms, executed_at
                 FROM query_history WHERE connection_id = ?1
                 ORDER BY executed_at DESC LIMIT ?2 OFFSET ?3".to_string(),
                vec![Box::new(cid.to_string()) as Box<dyn rusqlite::types::ToSql>, Box::new(limit as i64), Box::new(offset as i64)],
            )
        } else {
            (
                "SELECT id, connection_id, sql_text, dialect, status, error_message, row_count, duration_ms, executed_at
                 FROM query_history ORDER BY executed_at DESC LIMIT ?1 OFFSET ?2".to_string(),
                vec![Box::new(limit as i64) as Box<dyn rusqlite::types::ToSql>, Box::new(offset as i64)],
            )
        };

        let mut stmt = self.conn().prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            Ok(HistoryRecord {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                sql_text: row.get(2)?,
                dialect: row.get(3)?,
                status: row.get(4)?,
                error_message: row.get(5)?,
                row_count: row.get(6)?,
                duration_ms: row.get(7)?,
                executed_at: row.get(8)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db)
    }

    pub fn delete_history(&self, id: &str) -> Result<bool, StoreError> {
        let affected = self
            .conn()
            .execute("DELETE FROM query_history WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }
}
