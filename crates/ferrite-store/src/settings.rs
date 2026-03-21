use crate::store::{AppStore, StoreError};

impl AppStore {
    pub fn get_setting(&self, key: &str) -> Result<Option<String>, StoreError> {
        let result = self.conn().query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [key],
            |row| row.get(0),
        );
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(StoreError::Db(e)),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), StoreError> {
        self.conn().execute(
            "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
            [key, value],
        )?;
        Ok(())
    }

    pub fn delete_setting(&self, key: &str) -> Result<bool, StoreError> {
        let affected = self
            .conn()
            .execute("DELETE FROM settings WHERE key = ?1", [key])?;
        Ok(affected > 0)
    }

    pub fn get_all_settings(&self) -> Result<Vec<(String, String)>, StoreError> {
        let mut stmt = self
            .conn()
            .prepare("SELECT key, value FROM settings ORDER BY key")?;
        let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db)
    }
}
