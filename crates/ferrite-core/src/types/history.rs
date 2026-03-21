use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QueryStatus {
    Success,
    Error,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub sql_text: String,
    pub dialect: String,
    pub status: QueryStatus,
    pub error_message: Option<String>,
    pub row_count: Option<i64>,
    pub duration_ms: Option<i64>,
    pub executed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryVersion {
    pub id: Uuid,
    pub connection_id: Option<Uuid>,
    pub title: String,
    pub sql_text: String,
    pub version: i32,
    pub parent_id: Option<Uuid>,
    pub label: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionCreate {
    pub connection_id: Option<Uuid>,
    pub title: String,
    pub sql_text: String,
    pub parent_id: Option<Uuid>,
    pub label: Option<String>,
    pub notes: Option<String>,
}
