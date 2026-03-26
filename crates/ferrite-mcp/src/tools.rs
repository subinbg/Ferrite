use crate::validate::validate_readonly_sql;
use ferrite_crypto::vault::MasterVault;
use ferrite_db::pool::PoolManager;
use ferrite_store::store::AppStore;
use anyhow::{Result, bail};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

/// Shared state passed to MCP tool handlers.
/// Vault and "at least one connection" checks are enforced by the middleware layer.
/// Tool handlers only need to check the specific connection_id they operate on.
#[derive(Clone, Debug)]
pub struct McpState {
    pub vault: Arc<RwLock<Option<MasterVault>>>,
    pub pool_manager: Arc<RwLock<PoolManager>>,
    pub store: Arc<Mutex<AppStore>>,
}

impl McpState {
    /// Check that a specific connection is active.
    pub async fn require_connection(&self, connection_id: &str) -> Result<Uuid> {
        let uuid = Uuid::parse_str(connection_id)
            .map_err(|_| anyhow::anyhow!("Invalid connection ID: {connection_id}"))?;
        if !self.pool_manager.read().await.is_connected(&uuid) {
            bail!("Database {connection_id} is not connected. Connect it in the Ferrite UI first.");
        }
        Ok(uuid)
    }
}

pub async fn list_connections(state: &McpState) -> Result<String> {
    let store = state.store.lock().await;
    let records = store.list_connections()?;
    let pool_mgr = state.pool_manager.read().await;

    let connections: Vec<serde_json::Value> = records
        .iter()
        .map(|r| {
            let uuid = Uuid::parse_str(&r.id).unwrap_or_default();
            serde_json::json!({
                "id": r.id, "name": r.name, "dialect": r.dialect,
                "host": r.host, "database": r.database_name,
                "connected": pool_mgr.is_connected(&uuid),
            })
        })
        .collect();
    Ok(serde_json::to_string_pretty(&connections)?)
}

pub async fn list_tables(state: &McpState, connection_id: &str, schema: &str) -> Result<String> {
    let uuid = state.require_connection(connection_id).await?;
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr.get(&uuid).ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
    let tables = driver.get_tables(schema).await.map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(serde_json::to_string_pretty(&tables)?)
}

pub async fn list_columns(state: &McpState, connection_id: &str, table: &str, schema: &str) -> Result<String> {
    let uuid = state.require_connection(connection_id).await?;
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr.get(&uuid).ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
    let columns = driver.get_columns(schema, table).await.map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(serde_json::to_string_pretty(&columns)?)
}

pub async fn execute_readonly_query(state: &McpState, connection_id: &str, sql: &str, limit: usize) -> Result<String> {
    validate_readonly_sql(sql).map_err(|e| anyhow::anyhow!("Read-only validation failed: {e}"))?;
    let uuid = state.require_connection(connection_id).await?;
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr.get(&uuid).ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
    let result = driver.execute(sql, &HashMap::new(), limit.min(1000), 0, 30).await.map_err(|e| anyhow::anyhow!("{e}"))?;
    let output = serde_json::json!({
        "columns": result.columns, "rows": result.rows,
        "row_count": result.row_count, "duration_ms": result.duration_ms, "truncated": result.truncated,
    });
    Ok(serde_json::to_string_pretty(&output)?)
}

pub async fn explain_query(state: &McpState, connection_id: &str, sql: &str) -> Result<String> {
    let uuid = state.require_connection(connection_id).await?;
    let pool_mgr = state.pool_manager.read().await;
    let driver = pool_mgr.get(&uuid).ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
    let result = driver.explain(sql, &HashMap::new()).await.map_err(|e| anyhow::anyhow!("{e}"))?;
    Ok(serde_json::to_string_pretty(&result)?)
}
