use crate::sql::ClauseBuilder;
use crate::store::{AppStore, StoreError};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ConnectionRecord {
    pub id: String,
    pub name: String,
    pub dialect: String,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub database_name: Option<String>,
    pub username: Option<String>,
    pub password_enc: Option<Vec<u8>>,
    pub password_nonce: Option<Vec<u8>>,
    pub ssl_mode: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug)]
pub struct NewConnection {
    pub name: String,
    pub dialect: String,
    pub host: Option<String>,
    pub port: Option<i64>,
    pub database_name: Option<String>,
    pub username: Option<String>,
    pub password_enc: Option<Vec<u8>>,
    pub password_nonce: Option<Vec<u8>>,
    pub ssl_mode: String,
    pub color: Option<String>,
}

/// Borrowed set of fields to update; `None` fields are left unchanged.
#[derive(Debug, Default)]
pub struct ConnectionPatch<'a> {
    pub name: Option<&'a str>,
    pub host: Option<&'a str>,
    pub port: Option<i64>,
    pub database_name: Option<&'a str>,
    pub username: Option<&'a str>,
    pub password_enc: Option<&'a [u8]>,
    pub password_nonce: Option<&'a [u8]>,
    pub ssl_mode: Option<&'a str>,
    pub color: Option<&'a str>,
    pub sort_order: Option<i64>,
}

impl AppStore {
    pub fn list_connections(&self) -> Result<Vec<ConnectionRecord>, StoreError> {
        let mut stmt = self.conn().prepare(
            "SELECT id, name, dialect, host, port, database_name, username,
                    password_enc, password_nonce, ssl_mode, color, sort_order,
                    created_at, updated_at
             FROM connections ORDER BY sort_order, name",
        )?;

        let rows = stmt.query_map([], map_connection)?;

        rows.collect::<Result<Vec<_>, _>>().map_err(StoreError::Db)
    }

    pub fn get_connection(&self, id: &str) -> Result<ConnectionRecord, StoreError> {
        self.conn()
            .query_row(
                "SELECT id, name, dialect, host, port, database_name, username,
                        password_enc, password_nonce, ssl_mode, color, sort_order,
                        created_at, updated_at
                 FROM connections WHERE id = ?1",
                [id],
                map_connection,
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    StoreError::NotFound(format!("connection {id}"))
                }
                other => StoreError::Db(other),
            })
    }

    pub fn insert_connection(&self, conn: &NewConnection) -> Result<ConnectionRecord, StoreError> {
        let id = Uuid::new_v4().to_string();
        self.conn().execute(
            "INSERT INTO connections (id, name, dialect, host, port, database_name, username,
                                     password_enc, password_nonce, ssl_mode, color)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                id,
                conn.name,
                conn.dialect,
                conn.host,
                conn.port,
                conn.database_name,
                conn.username,
                conn.password_enc,
                conn.password_nonce,
                conn.ssl_mode,
                conn.color,
            ],
        )?;
        self.get_connection(&id)
    }

    pub fn update_connection(
        &self,
        id: &str,
        patch: &ConnectionPatch,
    ) -> Result<ConnectionRecord, StoreError> {
        let mut b = ClauseBuilder::new();
        b.push_opt("name", patch.name.map(str::to_owned));
        b.push_opt("host", patch.host.map(str::to_owned));
        b.push_opt("ssl_mode", patch.ssl_mode.map(str::to_owned));
        b.push_opt("color", patch.color.map(str::to_owned));
        b.push_opt("port", patch.port);
        b.push_opt("database_name", patch.database_name.map(str::to_owned));
        b.push_opt("username", patch.username.map(str::to_owned));
        b.push_opt("password_enc", patch.password_enc.map(<[u8]>::to_vec));
        b.push_opt("password_nonce", patch.password_nonce.map(<[u8]>::to_vec));
        b.push_opt("sort_order", patch.sort_order);

        if b.is_empty() {
            return self.get_connection(id);
        }

        let id_idx = b.bind(id.to_owned());
        let sql = format!(
            "UPDATE connections SET {}, updated_at = datetime('now') WHERE id = ?{id_idx}",
            b.join(", ")
        );
        self.conn().execute(&sql, b.refs().as_slice())?;

        self.get_connection(id)
    }

    pub fn delete_connection(&self, id: &str) -> Result<bool, StoreError> {
        let affected = self
            .conn()
            .execute("DELETE FROM connections WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }
}

fn map_connection(row: &rusqlite::Row) -> rusqlite::Result<ConnectionRecord> {
    Ok(ConnectionRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        dialect: row.get(2)?,
        host: row.get(3)?,
        port: row.get(4)?,
        database_name: row.get(5)?,
        username: row.get(6)?,
        password_enc: row.get(7)?,
        password_nonce: row.get(8)?,
        ssl_mode: row.get(9)?,
        color: row.get(10)?,
        sort_order: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::AppStore;

    #[test]
    fn test_connection_crud() {
        let store = AppStore::open_memory().unwrap();

        // Insert
        let new = NewConnection {
            name: "Test PG".to_string(),
            dialect: "postgresql".to_string(),
            host: Some("localhost".to_string()),
            port: Some(5432),
            database_name: Some("testdb".to_string()),
            username: Some("postgres".to_string()),
            password_enc: Some(vec![1, 2, 3]),
            password_nonce: Some(vec![4, 5, 6]),
            ssl_mode: "prefer".to_string(),
            color: Some("#3b82f6".to_string()),
        };

        let record = store.insert_connection(&new).unwrap();
        assert_eq!(record.name, "Test PG");
        assert_eq!(record.dialect, "postgresql");

        // List
        let all = store.list_connections().unwrap();
        assert_eq!(all.len(), 1);

        // Get
        let fetched = store.get_connection(&record.id).unwrap();
        assert_eq!(fetched.host, Some("localhost".to_string()));

        // Update
        let updated = store
            .update_connection(
                &record.id,
                &ConnectionPatch {
                    name: Some("Renamed"),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(updated.name, "Renamed");

        // Delete
        let deleted = store.delete_connection(&record.id).unwrap();
        assert!(deleted);

        let all = store.list_connections().unwrap();
        assert_eq!(all.len(), 0);
    }
}
