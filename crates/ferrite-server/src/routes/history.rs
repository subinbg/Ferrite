use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use ferrite_store::versions::{NewVersion, VersionUpdate};

use crate::state::AppState;

// --- Query Versions ---

#[derive(serde::Deserialize)]
pub struct VersionsQuery {
    pub search: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize { 100 }

pub async fn list_versions(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<VersionsQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let versions = store
        .list_versions(params.search.as_deref(), params.limit, params.offset)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(versions))
}

pub async fn create_version(
    State(state): State<AppState>,
    Json(req): Json<NewVersion>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let version = store
        .create_version(&req)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok((StatusCode::CREATED, Json(version)))
}

pub async fn update_version(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<VersionUpdate>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let version = store
        .update_version(&id, &req)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(version))
}

pub async fn delete_version(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    store
        .delete_version(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn diff_versions(
    State(state): State<AppState>,
    Path((id, other_id)): Path<(String, String)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let left = store
        .get_version(&id)
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;
    let right = store
        .get_version(&other_id)
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "left": { "id": left.id, "title": left.title, "version": left.version, "sql": left.sql_text, "created_at": left.created_at },
        "right": { "id": right.id, "title": right.title, "version": right.version, "sql": right.sql_text, "created_at": right.created_at },
    })))
}
