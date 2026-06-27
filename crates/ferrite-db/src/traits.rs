use crate::FerriteError;
use crate::types::connection::DatabaseDialect;
use crate::types::query::{ExplainResult, QueryResult};
use crate::types::schema::{ColumnInfo, TableInfo};
use std::collections::HashMap;
use std::future::Future;

/// Read/introspect contract shared by every dialect driver. Connection lifecycle
/// (`connect`/`test_connection`/`close`) is dialect-specific and lives outside this trait.
pub trait Driver: Send + Sync {
    fn dialect(&self) -> DatabaseDialect;

    fn get_schemas(&self) -> impl Future<Output = Result<Vec<String>, FerriteError>> + Send;

    fn get_tables(
        &self,
        schema: &str,
    ) -> impl Future<Output = Result<Vec<TableInfo>, FerriteError>> + Send;

    fn get_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> impl Future<Output = Result<Vec<ColumnInfo>, FerriteError>> + Send;

    fn execute(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
        limit: usize,
        offset: usize,
        timeout_seconds: u64,
    ) -> impl Future<Output = Result<QueryResult, FerriteError>> + Send;

    fn explain(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
    ) -> impl Future<Output = Result<ExplainResult, FerriteError>> + Send;
}
