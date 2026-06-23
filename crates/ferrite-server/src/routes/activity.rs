use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use serde::Deserialize;

use crate::state::AppState;

#[derive(Deserialize)]
pub struct ActivityQuery {
    #[serde(rename = "type")]
    pub activity_type: Option<String>,
    pub source: Option<String>,
    pub search: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    100
}

pub async fn list_activities(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<ActivityQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let activities = store
        .list_activities(
            params.activity_type.as_deref(),
            params.source.as_deref(),
            params.search.as_deref(),
            params.limit,
            params.offset,
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(activities))
}

pub async fn delete_activity(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    store
        .delete_activity(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}
