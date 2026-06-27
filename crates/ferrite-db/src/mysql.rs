use crate::FerriteError;
use crate::sql::{LiteralStyle, collect_rows, process_bind_variables};
use crate::traits::Driver;
use crate::types::connection::{ConnectParams, DatabaseDialect};
use crate::types::query::{ExplainResult, ExplainSummary, QueryResult};
use crate::types::schema::{ColumnInfo, TableInfo};
use sqlx::ConnectOptions;
use sqlx::mysql::{MySqlConnectOptions, MySqlPool, MySqlSslMode};
use sqlx::{Column, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use std::time::Instant;
use uuid::Uuid;

pub struct MysqlDriver {
    pool: MySqlPool,
}

fn build_mysql_options(params: &ConnectParams) -> MySqlConnectOptions {
    let ssl = match params.ssl_mode.as_str() {
        "require" => MySqlSslMode::Required,
        "disable" => MySqlSslMode::Disabled,
        _ => MySqlSslMode::Preferred,
    };

    let mut opts = MySqlConnectOptions::new()
        .host(&params.host)
        .port(params.port)
        .username(&params.username)
        .ssl_mode(ssl);

    // A MySQL connection may omit the default database; only set it when provided.
    if !params.database.is_empty() {
        opts = opts.database(&params.database);
    }
    if let Some(ref pw) = params.password {
        opts = opts.password(pw);
    }

    // Suppress verbose sqlx logging
    opts = opts.log_statements(tracing::log::LevelFilter::Debug);

    opts
}

impl MysqlDriver {
    pub fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    pub async fn connect(params: &ConnectParams) -> Result<Self, FerriteError> {
        let opts = build_mysql_options(params);
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect_with(opts)
            .await
            .map_err(|e| FerriteError::Connection(e.to_string()))?;
        Ok(Self { pool })
    }

    pub async fn close(self) {
        self.pool.close().await;
    }

    pub async fn test_connection(
        params: &ConnectParams,
    ) -> Result<std::time::Duration, FerriteError> {
        let start = Instant::now();
        let opts = build_mysql_options(params);
        let pool = sqlx::mysql::MySqlPoolOptions::new()
            .max_connections(1)
            .acquire_timeout(std::time::Duration::from_secs(10))
            .connect_with(opts)
            .await
            .map_err(|e| FerriteError::Connection(e.to_string()))?;

        sqlx::query("SELECT 1")
            .execute(&pool)
            .await
            .map_err(|e| FerriteError::Connection(e.to_string()))?;

        pool.close().await;
        Ok(start.elapsed())
    }
}

impl Driver for MysqlDriver {
    fn dialect(&self) -> DatabaseDialect {
        DatabaseDialect::MySQL
    }

    async fn get_schemas(&self) -> Result<Vec<String>, FerriteError> {
        let rows = sqlx::query(
            "SELECT schema_name FROM information_schema.schemata
             WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
             ORDER BY schema_name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows.iter().map(|r| info_string(r, 0)).collect())
    }

    async fn get_tables(&self, _schema: &str) -> Result<Vec<TableInfo>, FerriteError> {
        // MySQL "schemas" are databases; the explorer always passes "public", so scope to the
        // database selected at connection time via DATABASE() (like SQLite ignores the arg).
        let rows = sqlx::query(
            "SELECT table_schema, table_name, table_type, CAST(table_rows AS SIGNED) AS est_rows
             FROM information_schema.tables
             WHERE table_schema = DATABASE()
               AND table_type IN ('BASE TABLE', 'VIEW')
             ORDER BY table_name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows
            .iter()
            .map(|r| TableInfo {
                schema: info_string(r, 0),
                name: info_string(r, 1),
                table_type: info_string(r, 2),
                estimated_row_count: r.try_get::<i64, _>(3).ok(),
            })
            .collect())
    }

    async fn get_columns(
        &self,
        _schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, FerriteError> {
        let rows = sqlx::query(
            "SELECT column_name, data_type, is_nullable, column_default,
                    CAST(ordinal_position AS SIGNED) AS ordinal_position, column_key
             FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ?
             ORDER BY ordinal_position",
        )
        .bind(table)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows
            .iter()
            .map(|r| ColumnInfo {
                name: info_string(r, 0),
                data_type: info_string(r, 1),
                is_nullable: info_string(r, 2) == "YES",
                column_default: info_opt_string(r, 3),
                ordinal_position: r.try_get::<i64, _>(4).unwrap_or(0) as i32,
                is_primary_key: info_string(r, 5) == "PRI",
            })
            .collect())
    }

    async fn execute(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
        limit: usize,
        offset: usize,
        timeout_seconds: u64,
    ) -> Result<QueryResult, FerriteError> {
        let execution_id = Uuid::new_v4();
        let start = Instant::now();

        let processed_sql = process_bind_variables(sql, bind_variables, LiteralStyle::Mysql)?;

        let timeout = std::time::Duration::from_secs(if timeout_seconds > 0 {
            timeout_seconds
        } else {
            30
        });
        let stream = sqlx::query(&processed_sql).fetch(&self.pool);
        let (columns, data_rows, seen, truncated) = tokio::time::timeout(
            timeout,
            collect_rows::<sqlx::MySql, _, _>(stream, limit, offset, row_to_json_values),
        )
        .await
        .map_err(|_| FerriteError::QueryTimeout(timeout.as_secs()))??;

        let duration_ms = start.elapsed().as_millis() as u64;
        let row_count = data_rows.len();
        let total_count = if truncated { None } else { Some(seen) };

        Ok(QueryResult {
            execution_id,
            columns,
            rows: data_rows,
            row_count,
            total_count,
            duration_ms,
            truncated,
        })
    }

    async fn explain(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
    ) -> Result<ExplainResult, FerriteError> {
        let processed_sql = process_bind_variables(sql, bind_variables, LiteralStyle::Mysql)?;
        // FORMAT=JSON plans the query without executing it (no ANALYZE).
        let explain_sql = format!("EXPLAIN FORMAT=JSON {processed_sql}");

        let rows = sqlx::query(&explain_sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| FerriteError::Database(e.to_string()))?;

        let raw_plan: serde_json::Value = if rows.is_empty() {
            serde_json::Value::Null
        } else {
            // MySQL returns the plan as a JSON string in the single result column.
            rows[0]
                .try_get::<String, _>(0)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .or_else(|| rows[0].try_get::<serde_json::Value, _>(0).ok())
                .unwrap_or(serde_json::Value::Null)
        };

        Ok(ExplainResult {
            raw_plan: raw_plan.clone(),
            summary: parse_mysql_explain(&raw_plan),
        })
    }
}

fn row_to_json_values(row: &sqlx::mysql::MySqlRow) -> Vec<serde_json::Value> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(i, col)| {
            let type_name = col.type_info().name();
            mysql_column_to_json(row, i, type_name)
        })
        .collect()
}

fn mysql_column_to_json(
    row: &sqlx::mysql::MySqlRow,
    idx: usize,
    type_name: &str,
) -> serde_json::Value {
    use sqlx::types::chrono;

    // Check if the column is SQL NULL first via raw value
    if let Ok(raw) = row.try_get_raw(idx)
        && raw.is_null()
    {
        return serde_json::Value::Null;
    }

    let upper = type_name.to_ascii_uppercase();
    let base = upper.strip_suffix(" UNSIGNED").unwrap_or(upper.as_str());

    match base {
        // TINYINT(1) surfaces as "BOOLEAN"; emit 0/1 as a number for all integer kinds.
        "TINYINT" | "SMALLINT" | "MEDIUMINT" | "INT" | "INTEGER" | "BIGINT" | "YEAR" | "BOOL"
        | "BOOLEAN" => row
            .try_get::<i64, _>(idx)
            .ok()
            .map(|v| serde_json::Value::Number(v.into()))
            .or_else(|| {
                row.try_get::<u64, _>(idx)
                    .ok()
                    .map(|v| serde_json::Value::Number(v.into()))
            })
            .or_else(|| {
                row.try_get::<i8, _>(idx)
                    .ok()
                    .map(|v| serde_json::Value::Number((v as i64).into()))
            })
            .or_else(|| {
                row.try_get::<bool, _>(idx)
                    .ok()
                    .map(|b| serde_json::Value::Number((b as i64).into()))
            })
            .unwrap_or(serde_json::Value::Null),

        "FLOAT" => row
            .try_get::<f32, _>(idx)
            .ok()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        "DOUBLE" | "REAL" => row
            .try_get::<f64, _>(idx)
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),

        // Preserve full precision by stringifying the decimal.
        "DECIMAL" | "NUMERIC" => row
            .try_get::<sqlx::types::BigDecimal, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.to_string()))
            .unwrap_or(serde_json::Value::Null),

        "JSON" => row
            .try_get::<serde_json::Value, _>(idx)
            .ok()
            .unwrap_or(serde_json::Value::Null),

        "DATETIME" | "TIMESTAMP" => row
            .try_get::<chrono::NaiveDateTime, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string()))
            .unwrap_or(serde_json::Value::Null),
        "DATE" => row
            .try_get::<chrono::NaiveDate, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.format("%Y-%m-%d").to_string()))
            .unwrap_or(serde_json::Value::Null),
        "TIME" => row
            .try_get::<chrono::NaiveTime, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.format("%H:%M:%S").to_string()))
            .unwrap_or(serde_json::Value::Null),

        "BIT" => row
            .try_get::<u64, _>(idx)
            .ok()
            .map(|v| serde_json::Value::Number(v.into()))
            .or_else(|| {
                row.try_get::<Vec<u8>, _>(idx)
                    .ok()
                    .map(|v| serde_json::Value::String(format!("0x{}", hex_encode(&v))))
            })
            .unwrap_or(serde_json::Value::Null),

        "BINARY" | "VARBINARY" | "BLOB" | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" => row
            .try_get::<Vec<u8>, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(format!("0x{}", hex_encode(&v))))
            .unwrap_or(serde_json::Value::Null),

        // VARCHAR, CHAR, TEXT variants, ENUM, SET, and anything else
        _ => row
            .try_get::<String, _>(idx)
            .ok()
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Read an information_schema text column. MySQL 8 reports these with a binary collation
/// (SQL type `VARBINARY`), so fall back to raw bytes when a direct `String` decode fails.
fn info_string(row: &sqlx::mysql::MySqlRow, idx: usize) -> String {
    row.try_get::<String, _>(idx)
        .ok()
        .or_else(|| {
            row.try_get::<Vec<u8>, _>(idx)
                .ok()
                .map(|b| String::from_utf8_lossy(&b).into_owned())
        })
        .unwrap_or_default()
}

/// Like [`info_string`] but yields `None` for SQL NULL (e.g. a column's default value).
fn info_opt_string(row: &sqlx::mysql::MySqlRow, idx: usize) -> Option<String> {
    if let Ok(raw) = row.try_get_raw(idx)
        && raw.is_null()
    {
        return None;
    }
    row.try_get::<String, _>(idx).ok().or_else(|| {
        row.try_get::<Vec<u8>, _>(idx)
            .ok()
            .map(|b| String::from_utf8_lossy(&b).into_owned())
    })
}

fn parse_mysql_explain(plan: &serde_json::Value) -> ExplainSummary {
    // MySQL EXPLAIN FORMAT=JSON nests the cost under query_block.cost_info.query_cost (a string).
    let total_cost = plan
        .get("query_block")
        .and_then(|qb| qb.get("cost_info"))
        .and_then(|ci| ci.get("query_cost"))
        .and_then(|v| {
            v.as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .or_else(|| v.as_f64())
        });

    ExplainSummary {
        total_cost,
        execution_time_ms: None,
        nodes: vec![],
    }
}
