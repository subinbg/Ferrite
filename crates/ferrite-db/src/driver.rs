use crate::FerriteError;
use crate::traits::Driver;
use crate::types::connection::{ConnectParams, DatabaseDialect};
use crate::types::query::{ExplainResult, QueryResult};
use crate::types::schema::{ColumnInfo, TableInfo};
use std::collections::HashMap;

use crate::mysql::MysqlDriver;
use crate::postgres::PostgresDriver;
use crate::sqlite::SqliteDriver;

/// Unified driver that wraps dialect-specific implementations.
pub enum DatabaseDriver {
    Postgres(PostgresDriver),
    Mysql(MysqlDriver),
    Sqlite(SqliteDriver),
}

impl DatabaseDriver {
    pub fn dialect(&self) -> DatabaseDialect {
        match self {
            Self::Postgres(_) => DatabaseDialect::PostgreSQL,
            Self::Mysql(_) => DatabaseDialect::MySQL,
            Self::Sqlite(_) => DatabaseDialect::SQLite,
        }
    }

    pub async fn connect(params: &ConnectParams) -> Result<Self, FerriteError> {
        match params.dialect {
            DatabaseDialect::PostgreSQL => {
                Ok(Self::Postgres(PostgresDriver::connect(params).await?))
            }
            DatabaseDialect::MySQL => Ok(Self::Mysql(MysqlDriver::connect(params).await?)),
            DatabaseDialect::SQLite => Ok(Self::Sqlite(SqliteDriver::connect(params).await?)),
        }
    }

    pub async fn test_connection(
        params: &ConnectParams,
    ) -> Result<std::time::Duration, FerriteError> {
        match params.dialect {
            DatabaseDialect::PostgreSQL => PostgresDriver::test_connection(params).await,
            DatabaseDialect::MySQL => MysqlDriver::test_connection(params).await,
            DatabaseDialect::SQLite => SqliteDriver::test_connection(params).await,
        }
    }

    pub async fn get_schemas(&self) -> Result<Vec<String>, FerriteError> {
        match self {
            Self::Postgres(d) => d.get_schemas().await,
            Self::Mysql(d) => d.get_schemas().await,
            Self::Sqlite(d) => d.get_schemas().await,
        }
    }

    pub async fn get_tables(&self, schema: &str) -> Result<Vec<TableInfo>, FerriteError> {
        match self {
            Self::Postgres(d) => d.get_tables(schema).await,
            Self::Mysql(d) => d.get_tables(schema).await,
            Self::Sqlite(d) => d.get_tables(schema).await,
        }
    }

    pub async fn get_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, FerriteError> {
        match self {
            Self::Postgres(d) => d.get_columns(schema, table).await,
            Self::Mysql(d) => d.get_columns(schema, table).await,
            Self::Sqlite(d) => d.get_columns(schema, table).await,
        }
    }

    pub async fn execute(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
        limit: usize,
        offset: usize,
        timeout_seconds: u64,
    ) -> Result<QueryResult, FerriteError> {
        match self {
            Self::Postgres(d) => {
                d.execute(sql, bind_variables, limit, offset, timeout_seconds)
                    .await
            }
            Self::Mysql(d) => {
                d.execute(sql, bind_variables, limit, offset, timeout_seconds)
                    .await
            }
            Self::Sqlite(d) => {
                d.execute(sql, bind_variables, limit, offset, timeout_seconds)
                    .await
            }
        }
    }

    pub async fn explain(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
    ) -> Result<ExplainResult, FerriteError> {
        match self {
            Self::Postgres(d) => d.explain(sql, bind_variables).await,
            Self::Mysql(d) => d.explain(sql, bind_variables).await,
            Self::Sqlite(d) => d.explain(sql, bind_variables).await,
        }
    }

    /// Gracefully close the underlying connection pool.
    pub async fn close(self) {
        match self {
            Self::Postgres(d) => d.close().await,
            Self::Mysql(d) => d.close().await,
            Self::Sqlite(d) => d.close().await,
        }
    }
}
