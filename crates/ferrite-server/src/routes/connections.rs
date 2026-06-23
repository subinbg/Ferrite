use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
};
use ferrite_core::types::connection::{
    ConnectionCreate, ConnectionTestResult, ConnectionUpdate, DatabaseDialect,
};
use ferrite_store::connections::{ConnectionPatch, NewConnection};
use serde::Serialize;
use uuid::Uuid;

use crate::state::AppState;

#[derive(Serialize)]
pub struct ConnectionResponse {
    pub id: String,
    pub name: String,
    pub dialect: String,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub database_name: Option<String>,
    pub username: Option<String>,
    pub ssl_mode: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub connected: bool,
}

pub async fn list_connections(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let store = state.store.lock().await;
    let records = store
        .list_connections()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let pool_mgr = state.pool_manager.read().await;

    let connections: Vec<ConnectionResponse> = records
        .into_iter()
        .map(|r| {
            let connected = Uuid::parse_str(&r.id)
                .ok()
                .is_some_and(|id| pool_mgr.is_connected(&id));
            ConnectionResponse {
                id: r.id,
                name: r.name,
                dialect: r.dialect,
                host: r.host,
                port: r.port,
                database_name: r.database_name,
                username: r.username,
                ssl_mode: r.ssl_mode,
                color: r.color,
                sort_order: r.sort_order,
                created_at: r.created_at,
                updated_at: r.updated_at,
                connected,
            }
        })
        .collect();

    Ok(Json(connections))
}

pub async fn create_connection(
    State(state): State<AppState>,
    Json(req): Json<ConnectionCreate>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let vault = state.vault.read().await;
    let vault = vault
        .as_ref()
        .ok_or((StatusCode::LOCKED, "Vault is locked".to_string()))?;

    // Encrypt password if provided
    let (password_enc, password_nonce) = if let Some(ref pw) = req.password {
        let encrypted = vault
            .encrypt_string(pw)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (Some(encrypted.ciphertext), Some(encrypted.nonce))
    } else {
        (None, None)
    };

    let new_conn = NewConnection {
        name: req.name,
        dialect: req.dialect.to_string(),
        host: req.host,
        port: req.port.map(|p| p as i64),
        database_name: req.database_name,
        username: req.username,
        password_enc,
        password_nonce,
        ssl_mode: req
            .ssl_mode
            .map(|s| format!("{s:?}").to_lowercase())
            .unwrap_or_else(|| "prefer".to_string()),
        color: req.color,
    };

    let store = state.store.lock().await;
    let record = store
        .insert_connection(&new_conn)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok((
        StatusCode::CREATED,
        Json(ConnectionResponse {
            id: record.id,
            name: record.name,
            dialect: record.dialect,
            host: record.host,
            port: record.port,
            database_name: record.database_name,
            username: record.username,
            ssl_mode: record.ssl_mode,
            color: record.color,
            sort_order: record.sort_order,
            created_at: record.created_at,
            updated_at: record.updated_at,
            connected: false,
        }),
    ))
}

pub async fn update_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(req): Json<ConnectionUpdate>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let id_string = id.to_string();
    let vault = state.vault.read().await;
    let vault = vault
        .as_ref()
        .ok_or((StatusCode::LOCKED, "Vault is locked".to_string()))?;

    let (password_enc, password_nonce) = if let Some(ref pw) = req.password {
        let encrypted = vault
            .encrypt_string(pw)
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        (Some(encrypted.ciphertext), Some(encrypted.nonce))
    } else {
        (None, None)
    };

    let ssl_mode = req.ssl_mode.as_ref().map(|s| format!("{s:?}").to_lowercase());
    let store = state.store.lock().await;
    let record = store
        .update_connection(
            &id_string,
            &ConnectionPatch {
                name: req.name.as_deref(),
                host: req.host.as_deref(),
                port: req.port.map(|p| p as i64),
                database_name: req.database_name.as_deref(),
                username: req.username.as_deref(),
                password_enc: password_enc.as_deref(),
                password_nonce: password_nonce.as_deref(),
                ssl_mode: ssl_mode.as_deref(),
                color: req.color.as_deref(),
                sort_order: req.sort_order.map(|s| s as i64),
            },
        )
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let pool_mgr = state.pool_manager.read().await;

    Ok(Json(ConnectionResponse {
        id: record.id,
        name: record.name,
        dialect: record.dialect,
        host: record.host,
        port: record.port,
        database_name: record.database_name,
        username: record.username,
        ssl_mode: record.ssl_mode,
        color: record.color,
        sort_order: record.sort_order,
        created_at: record.created_at,
        updated_at: record.updated_at,
        connected: pool_mgr.is_connected(&id),
    }))
}

pub async fn delete_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    {
        let mut pool_mgr = state.pool_manager.write().await;
        pool_mgr.disconnect(&id).await;
    }

    let store = state.store.lock().await;
    store
        .delete_connection(&id.to_string())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn test_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let id_string = id.to_string();
    let params = build_connect_params(&state, &id_string).await?;

    tracing::info!(
        "Testing connection {id} (dialect={}, host={})",
        params.dialect,
        params.host
    );
    match ferrite_db::driver::DatabaseDriver::test_connection(&params).await {
        Ok(duration) => {
            tracing::info!("Connection test OK: {}ms", duration.as_millis());
            Ok(Json(ConnectionTestResult {
                ok: true,
                message: format!("Connected in {}ms", duration.as_millis()),
                latency_ms: duration.as_millis() as u64,
            }))
        }
        Err(e) => {
            tracing::warn!("Connection test failed: {e}");
            Ok(Json(ConnectionTestResult {
                ok: false,
                message: e.to_string(),
                latency_ms: 0,
            }))
        }
    }
}

pub async fn connect_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let params = build_connect_params(&state, &id.to_string()).await?;

    let mut pool_mgr = state.pool_manager.write().await;
    pool_mgr
        .connect(id, &params)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, e.to_string()))?;

    Ok(Json(serde_json::json!({"status": "connected"})))
}

pub async fn disconnect_connection(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let mut pool_mgr = state.pool_manager.write().await;
    pool_mgr.disconnect(&id).await;
    Ok(StatusCode::NO_CONTENT)
}

/// Build connection parameters from stored (encrypted) credentials.
async fn build_connect_params(
    state: &AppState,
    id: &str,
) -> Result<ferrite_core::types::connection::ConnectParams, (StatusCode, String)> {
    use ferrite_core::types::connection::ConnectParams;

    let vault = state.vault.read().await;
    let vault = vault
        .as_ref()
        .ok_or((StatusCode::LOCKED, "Vault is locked".to_string()))?;

    let store = state.store.lock().await;
    let record = store
        .get_connection(id)
        .map_err(|e| (StatusCode::NOT_FOUND, e.to_string()))?;

    let dialect = match record.dialect.as_str() {
        "postgresql" => DatabaseDialect::PostgreSQL,
        "sqlite" => DatabaseDialect::SQLite,
        other => return Err((StatusCode::BAD_REQUEST, format!("Unknown dialect: {other}"))),
    };

    // Decrypt password
    let password = if let (Some(enc), Some(nonce)) = (&record.password_enc, &record.password_nonce)
    {
        let encrypted = ferrite_crypto::vault::EncryptedData {
            ciphertext: enc.clone(),
            nonce: nonce.clone(),
        };
        Some(
            vault
                .decrypt_string(&encrypted)
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
        )
    } else {
        None
    };

    let host = record.host.as_deref().unwrap_or("localhost");
    let host = if host.is_empty() { "localhost" } else { host };

    Ok(ConnectParams {
        dialect,
        host: host.to_string(),
        port: record.port.unwrap_or(5432) as u16,
        database: record
            .database_name
            .as_deref()
            .unwrap_or("postgres")
            .to_string(),
        username: record.username.as_deref().unwrap_or("postgres").to_string(),
        password,
        ssl_mode: record.ssl_mode.clone(),
    })
}
