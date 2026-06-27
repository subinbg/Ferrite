use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnMeta {
    pub name: String,
    #[serde(rename = "type")]
    pub data_type: String,
    pub nullable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub execution_id: Uuid,
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub total_count: Option<usize>,
    pub duration_ms: u64,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainResult {
    pub raw_plan: serde_json::Value,
    pub summary: ExplainSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainSummary {
    pub total_cost: Option<f64>,
    pub execution_time_ms: Option<f64>,
    pub nodes: Vec<ExplainNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainNode {
    pub node_type: String,
    pub relation: Option<String>,
    pub cost: Option<f64>,
    pub rows: Option<u64>,
    pub width: Option<u64>,
    pub children: Vec<ExplainNode>,
}
