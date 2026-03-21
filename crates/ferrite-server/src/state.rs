use ferrite_crypto::vault::MasterVault;
use ferrite_db::pool::PoolManager;
use ferrite_store::store::AppStore;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
pub struct AppState {
    pub token: Arc<String>,
    pub version: &'static str,
    pub standalone: bool,
    pub store: Arc<Mutex<AppStore>>,
    pub vault: Arc<RwLock<Option<MasterVault>>>,
    pub pool_manager: Arc<RwLock<PoolManager>>,
}

impl AppState {
    pub fn new(token: String, store: AppStore, standalone: bool) -> Self {
        Self {
            token: Arc::new(token),
            version: env!("CARGO_PKG_VERSION"),
            standalone,
            store: Arc::new(Mutex::new(store)),
            vault: Arc::new(RwLock::new(None)),
            pool_manager: Arc::new(RwLock::new(PoolManager::new())),
        }
    }
}
