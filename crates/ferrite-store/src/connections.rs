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

impl AppStore {
    pub fn list_connections(&self) -> Result<Vec<ConnectionRecord>, StoreError> {
        let mut stmt = self.conn().prepare(
            "SELECT id, name, dialect, host, port, database_name, username,
                    password_enc, password_nonce, ssl_mode, color, sort_order,
                    created_at, updated_at
             FROM connections ORDER BY sort_order, name",
        )?;

        let rows = stmt.query_map([], |row| {
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
        })?;

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
                |row| {
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
                },
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
        name: Option<&str>,
        host: Option<&str>,
        port: Option<i64>,
        database_name: Option<&str>,
        username: Option<&str>,
        password_enc: Option<&[u8]>,
        password_nonce: Option<&[u8]>,
        ssl_mode: Option<&str>,
        color: Option<&str>,
        sort_order: Option<i64>,
    ) -> Result<ConnectionRecord, StoreError> {
        // Build dynamic SET clause
        let mut sets = Vec::new();
        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut idx = 1;

        macro_rules! maybe_set {
            ($field:expr, $col:literal, $val:expr) => {
                if let Some(v) = $val {
                    sets.push(format!("{} = ?{}", $col, idx));
                    params.push(Box::new(v.to_owned()));
                    idx += 1;
                }
            };
        }

        maybe_set!(name, "name", name);
        maybe_set!(host, "host", host);
        maybe_set!(ssl_mode, "ssl_mode", ssl_mode);
        maybe_set!(color, "color", color);

        if let Some(v) = port {
            sets.push(format!("port = ?{}", idx));
            params.push(Box::new(v));
            idx += 1;
        }
        if let Some(v) = database_name {
            sets.push(format!("database_name = ?{}", idx));
            params.push(Box::new(v.to_owned()));
            idx += 1;
        }
        if let Some(v) = username {
            sets.push(format!("username = ?{}", idx));
            params.push(Box::new(v.to_owned()));
            idx += 1;
        }
        if let Some(v) = password_enc {
            sets.push(format!("password_enc = ?{}", idx));
            params.push(Box::new(v.to_owned()));
            idx += 1;
        }
        if let Some(v) = password_nonce {
            sets.push(format!("password_nonce = ?{}", idx));
            params.push(Box::new(v.to_owned()));
            idx += 1;
        }
        if let Some(v) = sort_order {
            sets.push(format!("sort_order = ?{}", idx));
            params.push(Box::new(v));
            idx += 1;
        }

        if sets.is_empty() {
            return self.get_connection(id);
        }

        sets.push(format!("updated_at = datetime('now')"));
        let sql = format!(
            "UPDATE connections SET {} WHERE id = ?{}",
            sets.join(", "),
            idx
        );
        params.push(Box::new(id.to_owned()));

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        self.conn().execute(&sql, param_refs.as_slice())?;

        self.get_connection(id)
    }

    pub fn delete_connection(&self, id: &str) -> Result<bool, StoreError> {
        let affected = self
            .conn()
            .execute("DELETE FROM connections WHERE id = ?1", [id])?;
        Ok(affected > 0)
    }
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
            .update_connection(&record.id, Some("Renamed"), None, None, None, None, None, None, None, None, None)
            .unwrap();
        assert_eq!(updated.name, "Renamed");

        // Delete
        let deleted = store.delete_connection(&record.id).unwrap();
        assert!(deleted);

        let all = store.list_connections().unwrap();
        assert_eq!(all.len(), 0);
    }
}
