use crate::sql::ClauseBuilder;
use crate::store::{AppStore, StoreError};
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ActivityRecord {
    pub id: String,
    pub activity_type: String,
    pub source: String,
    pub connection_id: Option<String>,
    pub tool_name: Option<String>,
    pub request_text: String,
    pub request_params: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub result_summary: Option<String>,
    pub row_count: Option<i64>,
    pub duration_ms: Option<i64>,
    pub executed_at: String,
}

pub struct NewActivity {
    pub activity_type: String,
    pub source: String,
    pub connection_id: Option<String>,
    pub tool_name: Option<String>,
    pub request_text: String,
    pub request_params: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub result_summary: Option<String>,
    pub row_count: Option<i64>,
    pub duration_ms: Option<i64>,
}

impl AppStore {
    pub fn insert_activity(&self, a: &NewActivity) -> Result<(), StoreError> {
        let id = Uuid::new_v4().to_string();
        self.conn().execute(
            "INSERT INTO activity_log (id, activity_type, source, connection_id, tool_name, request_text, request_params, status, error_message, result_summary, row_count, duration_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                id, a.activity_type, a.source, a.connection_id, a.tool_name,
                a.request_text, a.request_params, a.status, a.error_message,
                a.result_summary, a.row_count, a.duration_ms,
            ],
        )?;
        Ok(())
    }

    pub fn list_activities(
        &self,
        type_filter: Option<&str>,
        source_filter: Option<&str>,
        search: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<ActivityRecord>, StoreError> {
        if let Some(query) = search {
            let mut stmt = self.conn().prepare(
                "SELECT a.id, a.activity_type, a.source, a.connection_id, a.tool_name,
                        a.request_text, a.request_params, a.status, a.error_message,
                        a.result_summary, a.row_count, a.duration_ms, a.executed_at
                 FROM activity_log a
                 JOIN activity_log_fts f ON a.rowid = f.rowid
                 WHERE activity_log_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2 OFFSET ?3",
            )?;
            let rows = stmt.query_map(
                rusqlite::params![query, limit as i64, offset as i64],
                map_activity,
            )?;
            return rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db);
        }

        let mut b = ClauseBuilder::new();
        b.push_opt("activity_type", type_filter.map(str::to_owned));
        b.push_opt("source", source_filter.map(str::to_owned));

        let where_clause = if b.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", b.join(" AND "))
        };
        let limit_idx = b.bind(limit as i64);
        let offset_idx = b.bind(offset as i64);

        let sql = format!(
            "SELECT id, activity_type, source, connection_id, tool_name,
                    request_text, request_params, status, error_message,
                    result_summary, row_count, duration_ms, executed_at
             FROM activity_log {where_clause}
             ORDER BY executed_at DESC LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
        );

        let mut stmt = self.conn().prepare(&sql)?;
        let rows = stmt.query_map(b.refs().as_slice(), map_activity)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db)
    }

    pub fn delete_activity(&self, id: &str) -> Result<bool, StoreError> {
        let affected = self
            .conn()
            .execute("DELETE FROM activity_log WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }
}

fn map_activity(row: &rusqlite::Row) -> rusqlite::Result<ActivityRecord> {
    Ok(ActivityRecord {
        id: row.get(0)?,
        activity_type: row.get(1)?,
        source: row.get(2)?,
        connection_id: row.get(3)?,
        tool_name: row.get(4)?,
        request_text: row.get(5)?,
        request_params: row.get(6)?,
        status: row.get(7)?,
        error_message: row.get(8)?,
        result_summary: row.get(9)?,
        row_count: row.get(10)?,
        duration_ms: row.get(11)?,
        executed_at: row.get(12)?,
    })
}
