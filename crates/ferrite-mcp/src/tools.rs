use crate::state::McpState;
use crate::validate::validate_readonly_sql;
use anyhow::Result;
use ferrite_store::activity::NewActivity;
use std::collections::HashMap;
use std::time::Instant;
use uuid::Uuid;

/// Log an MCP tool call to the activity log.
async fn log_activity(
    state: &McpState,
    tool_name: &str,
    connection_id: Option<&str>,
    request_text: &str,
    request_params: Option<&str>,
    result: &Result<String>,
    duration_ms: u64,
) {
    let (status, error_message, result_summary, row_count) = match result {
        Ok(text) => {
            let summary = if text.len() > 200 {
                &text[..200]
            } else {
                text.as_str()
            };
            ("success", None, Some(summary.to_string()), None)
        }
        Err(e) => ("error", Some(e.to_string()), None, None),
    };

    let store = state.store.lock().await;
    let _ = store.insert_activity(&NewActivity {
        activity_type: "mcp_tool".to_string(),
        source: "mcp".to_string(),
        connection_id: connection_id.map(|s| s.to_string()),
        tool_name: Some(tool_name.to_string()),
        request_text: request_text.to_string(),
        request_params: request_params.map(|s| s.to_string()),
        status: status.to_string(),
        error_message,
        result_summary,
        row_count,
        duration_ms: Some(duration_ms as i64),
    });
}

pub async fn list_connections(state: &McpState) -> Result<String> {
    let start = Instant::now();
    let result = async {
        let store = state.store.lock().await;
        let records = store.list_connections()?;
        let pool_mgr = state.pool_manager.read().await;
        let connections: Vec<serde_json::Value> = records
            .iter()
            .map(|r| {
                let connected = Uuid::parse_str(&r.id)
                    .ok()
                    .is_some_and(|uuid| pool_mgr.is_connected(&uuid));
                serde_json::json!({
                    "id": r.id, "name": r.name, "dialect": r.dialect,
                    "host": r.host, "database": r.database_name,
                    "connected": connected,
                })
            })
            .collect();
        Ok(serde_json::to_string_pretty(&connections)?)
    }
    .await;
    log_activity(
        state,
        "list_connections",
        None,
        "List all connections",
        None,
        &result,
        start.elapsed().as_millis() as u64,
    )
    .await;
    result
}

pub async fn list_tables(state: &McpState, connection_id: &str, schema: &str) -> Result<String> {
    let start = Instant::now();
    let params = serde_json::json!({"connection_id": connection_id, "schema": schema}).to_string();
    let result = async {
        let uuid = state.require_connection(connection_id).await?;
        let pool_mgr = state.pool_manager.read().await;
        let driver = pool_mgr
            .get(&uuid)
            .ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
        let tables = driver
            .get_tables(schema)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        Ok(serde_json::to_string_pretty(&tables)?)
    }
    .await;
    log_activity(
        state,
        "list_tables",
        Some(connection_id),
        &format!("List tables in {schema}"),
        Some(&params),
        &result,
        start.elapsed().as_millis() as u64,
    )
    .await;
    result
}

pub async fn list_columns(
    state: &McpState,
    connection_id: &str,
    table: &str,
    schema: &str,
) -> Result<String> {
    let start = Instant::now();
    let params =
        serde_json::json!({"connection_id": connection_id, "table": table, "schema": schema})
            .to_string();
    let result = async {
        let uuid = state.require_connection(connection_id).await?;
        let pool_mgr = state.pool_manager.read().await;
        let driver = pool_mgr
            .get(&uuid)
            .ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
        let columns = driver
            .get_columns(schema, table)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        Ok(serde_json::to_string_pretty(&columns)?)
    }
    .await;
    log_activity(
        state,
        "list_columns",
        Some(connection_id),
        &format!("List columns of {schema}.{table}"),
        Some(&params),
        &result,
        start.elapsed().as_millis() as u64,
    )
    .await;
    result
}

pub async fn execute_readonly_query(
    state: &McpState,
    connection_id: &str,
    sql: &str,
    limit: usize,
) -> Result<String> {
    let start = Instant::now();
    let params =
        serde_json::json!({"connection_id": connection_id, "sql": sql, "limit": limit}).to_string();
    let result = async {
        let uuid = state.require_connection(connection_id).await?;
        let pool_mgr = state.pool_manager.read().await;
        let driver = pool_mgr
            .get(&uuid)
            .ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
        validate_readonly_sql(sql, driver.dialect())
            .map_err(|e| anyhow::anyhow!("Read-only validation failed: {e}"))?;
        let qr = driver
            .execute(sql, &HashMap::new(), limit.min(1000), 0, 30)
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        let output = serde_json::json!({
            "columns": qr.columns, "rows": qr.rows,
            "row_count": qr.row_count, "duration_ms": qr.duration_ms, "truncated": qr.truncated,
        });
        Ok(serde_json::to_string_pretty(&output)?)
    }
    .await;
    log_activity(
        state,
        "execute_readonly_query",
        Some(connection_id),
        sql,
        Some(&params),
        &result,
        start.elapsed().as_millis() as u64,
    )
    .await;
    result
}

pub async fn explain_query(state: &McpState, connection_id: &str, sql: &str) -> Result<String> {
    let start = Instant::now();
    let params = serde_json::json!({"connection_id": connection_id, "sql": sql}).to_string();
    let result = async {
        let uuid = state.require_connection(connection_id).await?;
        let pool_mgr = state.pool_manager.read().await;
        let driver = pool_mgr
            .get(&uuid)
            .ok_or_else(|| anyhow::anyhow!("Connection lost"))?;
        let er = driver
            .explain(sql, &HashMap::new())
            .await
            .map_err(|e| anyhow::anyhow!("{e}"))?;
        Ok(serde_json::to_string_pretty(&er)?)
    }
    .await;
    log_activity(
        state,
        "explain_query",
        Some(connection_id),
        sql,
        Some(&params),
        &result,
        start.elapsed().as_millis() as u64,
    )
    .await;
    result
}
