use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use ferrite_store::activity::NewActivity;
use ferrite_store::history::NewHistoryEntry;

use crate::dto::QueryRequest;
use crate::state::AppState;

pub async fn execute_query(
    State(state): State<AppState>,
    Json(req): Json<QueryRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr
        .get(&req.connection_id)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let dialect = driver.dialect().to_string();

    let result = driver
        .execute(
            &req.sql,
            &req.bind_variables,
            req.limit,
            req.offset,
            req.timeout_seconds,
        )
        .await;

    // Derive the log fields once, then record in both history and the unified activity log.
    let (status, error_message, row_count, duration_ms, summary) = match &result {
        Ok(qr) => (
            "success",
            None,
            Some(qr.row_count as i64),
            Some(qr.duration_ms as i64),
            Some(format!("{} rows in {}ms", qr.row_count, qr.duration_ms)),
        ),
        Err(e) => ("error", Some(e.to_string()), None, None, None),
    };

    let store = state.store.lock().await;
    let _ = store.insert_history(&NewHistoryEntry {
        connection_id: req.connection_id.to_string(),
        sql_text: req.sql.clone(),
        dialect,
        status: status.to_string(),
        error_message: error_message.clone(),
        row_count,
        duration_ms,
    });
    let _ = store.insert_activity(&NewActivity {
        activity_type: "query".to_string(),
        source: "ui".to_string(),
        connection_id: Some(req.connection_id.to_string()),
        tool_name: None,
        request_text: req.sql.clone(),
        request_params: None,
        status: status.to_string(),
        error_message,
        result_summary: summary,
        row_count,
        duration_ms,
    });
    drop(store);

    let query_result = result.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    Ok(Json(query_result))
}

pub async fn explain_query(
    State(state): State<AppState>,
    Json(req): Json<QueryRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr
        .get(&req.connection_id)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let result = driver
        .explain(&req.sql, &req.bind_variables)
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json(result))
}

#[derive(serde::Deserialize)]
pub struct HistoryQuery {
    pub connection_id: Option<String>,
    pub search: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    100
}

pub async fn list_history(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<HistoryQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let entries = store
        .list_history(
            params.connection_id.as_deref(),
            params.search.as_deref(),
            params.limit,
            params.offset,
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(entries))
}

pub async fn delete_history(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    store
        .delete_history(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}
