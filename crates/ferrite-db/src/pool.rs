use ferrite_core::FerriteError;
use ferrite_core::types::connection::ConnectParams;
use std::collections::HashMap;
use uuid::Uuid;

use crate::driver::DatabaseDriver;

pub struct PoolManager {
    drivers: HashMap<Uuid, DatabaseDriver>,
}

impl PoolManager {
    pub fn new() -> Self {
        Self {
            drivers: HashMap::new(),
        }
    }

    pub async fn connect(
        &mut self,
        id: Uuid,
        params: &ConnectParams,
    ) -> Result<(), FerriteError> {
        if self.drivers.contains_key(&id) {
            return Ok(());
        }

        let driver = DatabaseDriver::connect(params).await?;
        self.drivers.insert(id, driver);
        Ok(())
    }

    pub fn get(&self, id: &Uuid) -> Option<&DatabaseDriver> {
        self.drivers.get(id)
    }

    /// Disconnect a single connection, gracefully closing the pool.
    pub async fn disconnect(&mut self, id: &Uuid) {
        if let Some(driver) = self.drivers.remove(id) {
            driver.close().await;
        }
    }

    /// Disconnect all connections, gracefully closing all pools.
    pub async fn disconnect_all(&mut self) {
        let drivers: Vec<DatabaseDriver> = self.drivers.drain().map(|(_, d)| d).collect();
        for driver in drivers {
            driver.close().await;
        }
    }

    pub fn is_connected(&self, id: &Uuid) -> bool {
        self.drivers.contains_key(id)
    }
}

impl Default for PoolManager {
    fn default() -> Self {
        Self::new()
    }
}
