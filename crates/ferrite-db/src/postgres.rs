use crate::FerriteError;
use crate::sql::{LiteralStyle, collect_rows, process_bind_variables};
use crate::traits::Driver;
use crate::types::connection::{ConnectParams, DatabaseDialect};
use crate::types::query::{ExplainResult, ExplainSummary, QueryResult};
use crate::types::schema::{ColumnInfo, TableInfo};
use sqlx::ConnectOptions;
use sqlx::postgres::{PgConnectOptions, PgPool, PgSslMode};
use sqlx::{Column, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use std::time::Instant;
use uuid::Uuid;

pub struct PostgresDriver {
    pool: PgPool,
}

fn build_pg_options(params: &ConnectParams) -> PgConnectOptions {
    let ssl = match params.ssl_mode.as_str() {
        "require" => PgSslMode::Require,
        "disable" => PgSslMode::Disable,
        _ => PgSslMode::Prefer,
    };

    let mut opts = PgConnectOptions::new()
        .host(&params.host)
        .port(params.port)
        .database(&params.database)
        .username(&params.username)
        .ssl_mode(ssl);

    if let Some(ref pw) = params.password {
        opts = opts.password(pw);
    }

    // Suppress verbose sqlx logging
    opts = opts.log_statements(tracing::log::LevelFilter::Debug);

    opts
}

impl PostgresDriver {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn connect(params: &ConnectParams) -> Result<Self, FerriteError> {
        let opts = build_pg_options(params);
        let pool = sqlx::postgres::PgPoolOptions::new()
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
        let opts = build_pg_options(params);
        let pool = sqlx::postgres::PgPoolOptions::new()
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

impl Driver for PostgresDriver {
    fn dialect(&self) -> DatabaseDialect {
        DatabaseDialect::PostgreSQL
    }

    async fn get_schemas(&self) -> Result<Vec<String>, FerriteError> {
        let rows = sqlx::query(
            "SELECT schema_name FROM information_schema.schemata
             WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
             ORDER BY schema_name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows.iter().map(|r| r.get::<String, _>(0)).collect())
    }

    async fn get_tables(&self, schema: &str) -> Result<Vec<TableInfo>, FerriteError> {
        let rows = sqlx::query(
            "SELECT t.table_schema, t.table_name, t.table_type,
                    (SELECT reltuples::bigint FROM pg_class c
                     JOIN pg_namespace n ON n.oid = c.relnamespace
                     WHERE n.nspname = t.table_schema AND c.relname = t.table_name) AS est_rows
             FROM information_schema.tables t
             WHERE t.table_schema = $1
               AND t.table_type IN ('BASE TABLE', 'VIEW')
             ORDER BY t.table_name",
        )
        .bind(schema)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows
            .iter()
            .map(|r| TableInfo {
                schema: r.get(0),
                name: r.get(1),
                table_type: r.get(2),
                estimated_row_count: r.get(3),
            })
            .collect())
    }

    async fn get_columns(
        &self,
        schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, FerriteError> {
        let rows = sqlx::query(
            "SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
                    c.ordinal_position,
                    EXISTS (
                        SELECT 1 FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu
                          ON tc.constraint_name = kcu.constraint_name
                         AND tc.table_schema = kcu.table_schema
                        WHERE tc.constraint_type = 'PRIMARY KEY'
                          AND tc.table_schema = c.table_schema
                          AND tc.table_name = c.table_name
                          AND kcu.column_name = c.column_name
                    ) AS is_pk
             FROM information_schema.columns c
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position",
        )
        .bind(schema)
        .bind(table)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows
            .iter()
            .map(|r| {
                let nullable: String = r.get(2);
                ColumnInfo {
                    name: r.get(0),
                    data_type: r.get(1),
                    is_nullable: nullable == "YES",
                    column_default: r.get(3),
                    ordinal_position: r.get::<i32, _>(4),
                    is_primary_key: r.get(5),
                }
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

        // SECURITY NOTE: Bind variables use literal text substitution, not parameterized queries.
        // This is by design for a database studio — the user controls both SQL and values.
        // Single quotes are escaped via '' (SQL standard). This matches DataGrip/DBeaver behavior.
        let processed_sql = process_bind_variables(sql, bind_variables, LiteralStyle::Postgres)?;

        let timeout = std::time::Duration::from_secs(if timeout_seconds > 0 {
            timeout_seconds
        } else {
            30
        });
        let stream = sqlx::query(&processed_sql).fetch(&self.pool);
        let (columns, data_rows, seen, truncated) = tokio::time::timeout(
            timeout,
            collect_rows::<sqlx::Postgres, _, _>(stream, limit, offset, row_to_json_values),
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
        let processed_sql = process_bind_variables(sql, bind_variables, LiteralStyle::Postgres)?;
        let explain_sql = format!("EXPLAIN (ANALYZE, FORMAT JSON) {processed_sql}");

        let rows = sqlx::query(&explain_sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| FerriteError::Database(e.to_string()))?;

        let raw_plan: serde_json::Value = if !rows.is_empty() {
            rows[0].get::<serde_json::Value, _>(0)
        } else {
            serde_json::Value::Null
        };

        Ok(ExplainResult {
            raw_plan: raw_plan.clone(),
            summary: parse_pg_explain(&raw_plan),
        })
    }
}

fn row_to_json_values(row: &sqlx::postgres::PgRow) -> Vec<serde_json::Value> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(i, col)| {
            let type_name = col.type_info().name();
            pg_column_to_json(row, i, type_name)
        })
        .collect()
}

fn pg_column_to_json(
    row: &sqlx::postgres::PgRow,
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

    match type_name {
        "BOOL" => row
            .try_get::<bool, _>(idx)
            .ok()
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null),

        "INT2" => row
            .try_get::<i16, _>(idx)
            .ok()
            .map(|v| serde_json::Value::Number((v as i64).into()))
            .unwrap_or(serde_json::Value::Null),
        "INT4" | "SERIAL" => row
            .try_get::<i32, _>(idx)
            .ok()
            .map(|v| serde_json::Value::Number((v as i64).into()))
            .unwrap_or(serde_json::Value::Null),
        "INT8" | "BIGSERIAL" => row
            .try_get::<i64, _>(idx)
            .ok()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),

        "FLOAT4" => row
            .try_get::<f32, _>(idx)
            .ok()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        "FLOAT8" | "NUMERIC" => row
            .try_get::<f64, _>(idx)
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),

        "JSON" | "JSONB" => row
            .try_get::<serde_json::Value, _>(idx)
            .ok()
            .unwrap_or(serde_json::Value::Null),

        "UUID" => row
            .try_get::<uuid::Uuid, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.to_string()))
            .unwrap_or(serde_json::Value::Null),

        "TIMESTAMPTZ" => row
            .try_get::<chrono::DateTime<chrono::Utc>, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.to_rfc3339()))
            .unwrap_or(serde_json::Value::Null),
        "TIMESTAMP" => row
            .try_get::<chrono::NaiveDateTime, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string()))
            .unwrap_or(serde_json::Value::Null),
        "DATE" => row
            .try_get::<chrono::NaiveDate, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.format("%Y-%m-%d").to_string()))
            .unwrap_or(serde_json::Value::Null),
        "TIME" | "TIMETZ" => row
            .try_get::<chrono::NaiveTime, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(v.format("%H:%M:%S").to_string()))
            .unwrap_or(serde_json::Value::Null),

        "BYTEA" => row
            .try_get::<Vec<u8>, _>(idx)
            .ok()
            .map(|v| serde_json::Value::String(format!("\\x{}", hex_encode(&v))))
            .unwrap_or(serde_json::Value::Null),

        // TEXT, VARCHAR, CHAR, NAME, and any other text-like types
        _ => row
            .try_get::<String, _>(idx)
            .ok()
            .map(serde_json::Value::String)
            .unwrap_or_else(|| {
                // Last resort: try to get the raw text representation
                row.try_get::<String, _>(idx)
                    .map(serde_json::Value::String)
                    .unwrap_or(serde_json::Value::Null)
            }),
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn parse_pg_explain(plan: &serde_json::Value) -> ExplainSummary {
    // PostgreSQL EXPLAIN (FORMAT JSON) returns an array with one element
    let node = plan
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|obj| obj.get("Plan"));

    let execution_time = plan
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|obj| obj.get("Execution Time"))
        .and_then(|v| v.as_f64());

    ExplainSummary {
        total_cost: node
            .and_then(|n| n.get("Total Cost"))
            .and_then(|v| v.as_f64()),
        execution_time_ms: execution_time,
        nodes: vec![], // Detailed node parsing can be added later
    }
}
