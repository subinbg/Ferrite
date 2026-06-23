use anyhow::{Result, bail};
use ferrite_crypto::vault::MasterVault;
use ferrite_db::pool::PoolManager;
use ferrite_store::store::AppStore;
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
    /// Check that a specific connection is active, returning its parsed id.
    pub async fn require_connection(&self, connection_id: &str) -> Result<Uuid> {
        let uuid = Uuid::parse_str(connection_id)
            .map_err(|_| anyhow::anyhow!("Invalid connection ID: {connection_id}"))?;
        if !self.pool_manager.read().await.is_connected(&uuid) {
            bail!("Database {connection_id} is not connected. Connect it in the Ferrite UI first.");
        }
        Ok(uuid)
    }
}
