use crate::types::connection::DatabaseDialect;
use crate::types::query::{ExplainResult, QueryResult};
use crate::types::schema::{ColumnInfo, TableInfo};
use std::collections::HashMap;
use std::future::Future;

pub trait DatabaseDriver: Send + Sync {
    fn dialect(&self) -> DatabaseDialect;

    fn test_connection(
        &self,
    ) -> impl Future<Output = Result<std::time::Duration, crate::FerriteError>> + Send;

    fn get_schemas(&self) -> impl Future<Output = Result<Vec<String>, crate::FerriteError>> + Send;

    fn get_tables(
        &self,
        schema: &str,
    ) -> impl Future<Output = Result<Vec<TableInfo>, crate::FerriteError>> + Send;

    fn get_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> impl Future<Output = Result<Vec<ColumnInfo>, crate::FerriteError>> + Send;

    fn execute(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
        limit: usize,
        offset: usize,
    ) -> impl Future<Output = Result<QueryResult, crate::FerriteError>> + Send;

    fn explain(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
    ) -> impl Future<Output = Result<ExplainResult, crate::FerriteError>> + Send;
}
