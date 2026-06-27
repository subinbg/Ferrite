use axum::{
    Json,
    extract::State,
    http::{StatusCode, header},
    response::IntoResponse,
};

use crate::dto::ExportRequest;
use crate::state::AppState;

pub async fn export_data(
    State(state): State<AppState>,
    Json(req): Json<ExportRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    // Execute the query to get data
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr
        .get(&req.connection_id)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let result = driver
        .execute(
            &req.sql,
            &std::collections::HashMap::new(),
            1_000_000,
            0,
            120,
        )
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let col_names: Vec<&str> = result.columns.iter().map(|c| c.name.as_str()).collect();
    let objects: Vec<serde_json::Value> = result
        .rows
        .iter()
        .map(|row| row_to_object(&col_names, row))
        .collect();
    let bytes = serde_json::to_vec_pretty(&objects)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        [
            (header::CONTENT_TYPE, "application/json".to_string()),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"export.json\"".to_string(),
            ),
        ],
        bytes,
    ))
}

/// Build a JSON object keyed by column name for a single result row.
fn row_to_object(columns: &[&str], row: &[serde_json::Value]) -> serde_json::Value {
    let mut map = serde_json::Map::with_capacity(columns.len());
    for (i, col) in columns.iter().enumerate() {
        let val = row.get(i).cloned().unwrap_or(serde_json::Value::Null);
        map.insert(col.to_string(), val);
    }
    serde_json::Value::Object(map)
}
