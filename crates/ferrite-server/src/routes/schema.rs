use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};
use ferrite_core::types::schema::ColumnInfo;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Deserialize)]
pub struct SchemaQuery {
    pub schema: Option<String>,
}

pub async fn list_schemas(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let uuid = Uuid::parse_str(&id).unwrap_or_default();
    let pool_mgr = state.pool_manager.read().await;

    let driver = pool_mgr
        .get(&uuid)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let schemas = driver
        .get_schemas()
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(schemas))
}

pub async fn list_tables(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<SchemaQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let uuid = Uuid::parse_str(&id).unwrap_or_default();
    let schema = params.schema.as_deref().unwrap_or("public");
    let pool_mgr = state.pool_manager.read().await;

    let driver = pool_mgr
        .get(&uuid)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let tables = driver
        .get_tables(schema)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(tables))
}

pub async fn list_columns(
    State(state): State<AppState>,
    Path((id, table)): Path<(String, String)>,
    Query(params): Query<SchemaQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let uuid = Uuid::parse_str(&id).unwrap_or_default();
    let schema = params.schema.as_deref().unwrap_or("public");
    let pool_mgr = state.pool_manager.read().await;

    let driver = pool_mgr
        .get(&uuid)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let columns = driver
        .get_columns(schema, &table)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(columns))
}

/// Returns all tables and their columns in one request (for autocompletion).
pub async fn full_schema(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<SchemaQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let uuid = Uuid::parse_str(&id).unwrap_or_default();
    let schema = params.schema.as_deref().unwrap_or("public");
    let pool_mgr = state.pool_manager.read().await;

    let driver = pool_mgr
        .get(&uuid)
        .ok_or((StatusCode::BAD_REQUEST, "Not connected".to_string()))?;

    let tables = driver
        .get_tables(schema)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut columns_by_table: HashMap<String, Vec<ColumnInfo>> = HashMap::new();
    for table in &tables {
        let cols = driver
            .get_columns(schema, &table.name)
            .await
            .unwrap_or_default();
        columns_by_table.insert(table.name.clone(), cols);
    }

    #[derive(Serialize)]
    struct FullSchema {
        tables: Vec<ferrite_core::types::schema::TableInfo>,
        columns_by_table: HashMap<String, Vec<ColumnInfo>>,
    }

    Ok(Json(FullSchema {
        tables,
        columns_by_table,
    }))
}
