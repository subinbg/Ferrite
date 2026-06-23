use ferrite_core::FerriteError;
use ferrite_core::types::connection::ConnectParams;
use ferrite_core::types::query::{ColumnMeta, ExplainResult, ExplainSummary, QueryResult};
use ferrite_core::types::schema::{ColumnInfo, TableInfo};
use futures::TryStreamExt;
use sqlx::ConnectOptions;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use sqlx::{Column, Row, TypeInfo};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Instant;
use uuid::Uuid;

pub struct SqliteDriver {
    pool: SqlitePool,
}

impl SqliteDriver {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn connect(params: &ConnectParams) -> Result<Self, FerriteError> {
        let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", params.database))
            .map_err(|e| FerriteError::Connection(e.to_string()))?
            .create_if_missing(true)
            .log_statements(tracing::log::LevelFilter::Debug);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(5)
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
        let opts = SqliteConnectOptions::from_str(&format!("sqlite:{}", params.database))
            .map_err(|e| FerriteError::Connection(e.to_string()))?
            .create_if_missing(true);
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(1)
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

    pub async fn get_schemas(&self) -> Result<Vec<String>, FerriteError> {
        // SQLite doesn't have schemas in the traditional sense
        Ok(vec!["main".to_string()])
    }

    pub async fn get_tables(&self, _schema: &str) -> Result<Vec<TableInfo>, FerriteError> {
        let rows = sqlx::query(
            "SELECT name, type FROM sqlite_master
             WHERE type IN ('table', 'view')
               AND name NOT LIKE 'sqlite_%'
               AND name NOT LIKE '_%'
             ORDER BY name",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows
            .iter()
            .map(|r| TableInfo {
                schema: "main".to_string(),
                name: r.get(0),
                table_type: r.get::<String, _>(1).to_uppercase(),
                estimated_row_count: None,
            })
            .collect())
    }

    pub async fn get_columns(
        &self,
        _schema: &str,
        table: &str,
    ) -> Result<Vec<ColumnInfo>, FerriteError> {
        // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
        let pragma_sql = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
        let rows = sqlx::query(&pragma_sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| FerriteError::Database(e.to_string()))?;

        Ok(rows
            .iter()
            .map(|r| {
                let notnull: bool = r.get::<bool, _>(3);
                let pk: i32 = r.get(5);
                ColumnInfo {
                    name: r.get(1),
                    data_type: r.get(2),
                    is_nullable: !notnull,
                    column_default: r.get(4),
                    ordinal_position: r.get::<i32, _>(0),
                    is_primary_key: pk > 0,
                }
            })
            .collect())
    }

    pub async fn execute(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
        limit: usize,
        offset: usize,
        timeout_seconds: u64,
    ) -> Result<QueryResult, FerriteError> {
        let execution_id = Uuid::new_v4();
        let start = Instant::now();

        let processed_sql = process_bind_variables_sqlite(sql, bind_variables)?;

        let timeout = std::time::Duration::from_secs(if timeout_seconds > 0 {
            timeout_seconds
        } else {
            30
        });
        let max_seen = offset.saturating_add(limit).saturating_add(1);
        let fetch = async {
            let mut stream = sqlx::query(&processed_sql).fetch(&self.pool);
            let mut columns: Option<Vec<ColumnMeta>> = None;
            let mut data_rows = Vec::new();
            let mut seen = 0usize;
            let mut truncated = false;

            while let Some(row) = stream
                .try_next()
                .await
                .map_err(|e| FerriteError::Database(e.to_string()))?
            {
                if columns.is_none() {
                    columns = Some(
                        row.columns()
                            .iter()
                            .map(|c| ColumnMeta {
                                name: c.name().to_string(),
                                data_type: c.type_info().name().to_string(),
                                nullable: true,
                            })
                            .collect(),
                    );
                }

                if seen >= offset && data_rows.len() < limit {
                    data_rows.push(sqlite_row_to_json(&row));
                }

                seen += 1;
                if seen >= max_seen {
                    truncated = true;
                    break;
                }
            }

            Ok::<_, FerriteError>((columns.unwrap_or_default(), data_rows, seen, truncated))
        };

        let (columns, data_rows, seen, truncated) =
            tokio::time::timeout(timeout, fetch)
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

    pub async fn explain(
        &self,
        sql: &str,
        bind_variables: &HashMap<String, serde_json::Value>,
    ) -> Result<ExplainResult, FerriteError> {
        let processed_sql = process_bind_variables_sqlite(sql, bind_variables)?;
        let explain_sql = format!("EXPLAIN QUERY PLAN {processed_sql}");

        let rows = sqlx::query(&explain_sql)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| FerriteError::Database(e.to_string()))?;

        let plan_rows: Vec<serde_json::Value> = rows
            .iter()
            .map(|row| {
                serde_json::json!({
                    "id": row.try_get::<i32, _>(0).unwrap_or(0),
                    "parent": row.try_get::<i32, _>(1).unwrap_or(0),
                    "notused": row.try_get::<i32, _>(2).unwrap_or(0),
                    "detail": row.try_get::<String, _>(3).unwrap_or_default(),
                })
            })
            .collect();

        Ok(ExplainResult {
            raw_plan: serde_json::Value::Array(plan_rows),
            summary: ExplainSummary {
                total_cost: None,
                execution_time_ms: None,
                nodes: vec![],
            },
        })
    }
}

/// Replace :name bind variables with literal SQL values (same approach as PostgreSQL driver).
fn process_bind_variables_sqlite(
    sql: &str,
    binds: &HashMap<String, serde_json::Value>,
) -> Result<String, FerriteError> {
    if binds.is_empty() {
        return Ok(sql.to_string());
    }

    let mut result = sql.to_string();
    let re = regex_lite::Regex::new(r":([a-zA-Z_][a-zA-Z0-9_]*)").unwrap();
    let mut replacements = Vec::new();

    for cap in re.captures_iter(sql) {
        let name = &cap[1];
        if let Some(value) = binds.get(name) {
            replacements.push((
                cap.get(0).unwrap().range(),
                json_to_sql_literal_sqlite(value),
            ));
        }
    }

    for (range, replacement) in replacements.into_iter().rev() {
        result.replace_range(range, &replacement);
    }

    Ok(result)
}

fn json_to_sql_literal_sqlite(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Null => "NULL".to_string(),
        serde_json::Value::Bool(b) => if *b { "1" } else { "0" }.to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => {
            let escaped = s.replace('\'', "''");
            format!("'{escaped}'")
        }
        other => {
            let escaped = other.to_string().replace('\'', "''");
            format!("'{escaped}'")
        }
    }
}

fn sqlite_row_to_json(row: &sqlx::sqlite::SqliteRow) -> Vec<serde_json::Value> {
    row.columns()
        .iter()
        .enumerate()
        .map(|(i, _col)| {
            // SQLite is dynamically typed; try each type
            if let Ok(Some(v)) = row.try_get::<Option<i64>, _>(i) {
                serde_json::Value::Number(v.into())
            } else if let Ok(Some(v)) = row.try_get::<Option<f64>, _>(i) {
                serde_json::Number::from_f64(v)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            } else if let Ok(Some(v)) = row.try_get::<Option<String>, _>(i) {
                serde_json::Value::String(v)
            } else if let Ok(Some(v)) = row.try_get::<Option<bool>, _>(i) {
                serde_json::Value::Bool(v)
            } else {
                serde_json::Value::Null
            }
        })
        .collect()
}
