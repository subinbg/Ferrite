use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    JsonLines,
    Excel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    pub connection_id: Uuid,
    pub sql: String,
    pub format: ExportFormat,
    #[serde(default)]
    pub options: ExportOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ExportOptions {
    pub delimiter: Option<String>,
    pub include_headers: Option<bool>,
    pub quote_char: Option<String>,
    pub pretty_print: Option<bool>,
    pub sheet_name: Option<String>,
}
