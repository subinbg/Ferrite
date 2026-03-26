pub mod tools;
pub mod validate;

use tools::McpState;
use rmcp::{
    ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    schemars, tool_router, tool, tool_handler,
};
use std::sync::Arc;

// ---- Request types ----

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListTablesRequest {
    /// UUID of the database connection (from list_connections)
    pub connection_id: String,
    /// Schema name (default: 'public' for PostgreSQL)
    pub schema: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ListColumnsRequest {
    /// UUID of the database connection
    pub connection_id: String,
    /// Table name
    pub table: String,
    /// Schema name (default: 'public')
    pub schema: Option<String>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ExecuteQueryRequest {
    /// UUID of the database connection
    pub connection_id: String,
    /// SQL query (must be read-only: SELECT, WITH, EXPLAIN only)
    pub sql: String,
    /// Maximum rows to return (default 100, max 1000)
    pub limit: Option<usize>,
}

#[derive(Debug, serde::Deserialize, schemars::JsonSchema)]
pub struct ExplainRequest {
    /// UUID of the database connection
    pub connection_id: String,
    /// SQL query to explain
    pub sql: String,
}

// ---- MCP Server ----

#[derive(Debug, Clone)]
pub struct FerriteMcpServer {
    state: McpState,
    tool_router: ToolRouter<Self>,
}

impl FerriteMcpServer {
    pub fn new(state: McpState) -> Self {
        Self {
            state,
            tool_router: Self::tool_router(),
        }
    }
}

#[tool_router]
impl FerriteMcpServer {
    #[tool(description = "List all database connections configured in Ferrite and whether they are currently connected. Use the 'id' field to reference a specific database in other tools.")]
    async fn list_connections(&self) -> String {
        match tools::list_connections(&self.state).await {
            Ok(text) => text,
            Err(e) => format!("Error: {e}"),
        }
    }

    #[tool(description = "List all tables and views in a database schema. The database must be connected first via the Ferrite UI.")]
    async fn list_tables(&self, Parameters(req): Parameters<ListTablesRequest>) -> String {
        let schema = req.schema.unwrap_or_else(|| "public".to_string());
        match tools::list_tables(&self.state, &req.connection_id, &schema).await {
            Ok(text) => text,
            Err(e) => format!("Error: {e}"),
        }
    }

    #[tool(description = "List all columns in a table with data types, nullability, defaults, and primary key info.")]
    async fn list_columns(&self, Parameters(req): Parameters<ListColumnsRequest>) -> String {
        let schema = req.schema.unwrap_or_else(|| "public".to_string());
        match tools::list_columns(&self.state, &req.connection_id, &req.table, &schema).await {
            Ok(text) => text,
            Err(e) => format!("Error: {e}"),
        }
    }

    #[tool(description = "Execute a read-only SQL query (SELECT, WITH, EXPLAIN only). Write operations are blocked. Returns columns and rows as JSON.")]
    async fn execute_readonly_query(&self, Parameters(req): Parameters<ExecuteQueryRequest>) -> String {
        let limit = req.limit.unwrap_or(100).min(1000);
        match tools::execute_readonly_query(&self.state, &req.connection_id, &req.sql, limit).await {
            Ok(text) => text,
            Err(e) => format!("Error: {e}"),
        }
    }

    #[tool(description = "Run EXPLAIN on a query to show the database execution plan.")]
    async fn explain_query(&self, Parameters(req): Parameters<ExplainRequest>) -> String {
        match tools::explain_query(&self.state, &req.connection_id, &req.sql).await {
            Ok(text) => text,
            Err(e) => format!("Error: {e}"),
        }
    }
}

#[tool_handler]
impl ServerHandler for FerriteMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions(
                "Ferrite Database Studio MCP server. Provides read-only access to databases \
                 connected in the Ferrite UI. The vault must be unlocked and databases must be \
                 connected via the UI before tools will work. Use list_connections first."
            )
    }
}

/// Middleware: reject ALL MCP requests if vault is locked or no connections are active.
async fn vault_guard(
    axum::extract::State(state): axum::extract::State<McpState>,
    request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    // Allow GET requests (SSE stream pickup) — they're already authenticated by session
    if request.method() == axum::http::Method::GET || request.method() == axum::http::Method::DELETE {
        return next.run(request).await;
    }

    // Check vault is unlocked
    if state.vault.read().await.is_none() {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "Ferrite vault is locked. Open the Ferrite app and enter your master password first.",
        ).into_response();
    }

    // Check at least one database connection is active
    let pool_mgr = state.pool_manager.read().await;
    let has_connections = pool_mgr.has_any_connection();
    drop(pool_mgr);

    if !has_connections {
        return (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "No database connections are active. Connect a database in the Ferrite UI first.",
        ).into_response();
    }

    next.run(request).await
}

/// Create an axum-compatible MCP HTTP SSE service with vault/connection middleware.
pub fn create_mcp_router(state: McpState) -> axum::Router {
    use rmcp::transport::streamable_http_server::{
        StreamableHttpService, StreamableHttpServerConfig,
        session::local::LocalSessionManager,
    };
    use std::time::Duration;

    let config = StreamableHttpServerConfig {
        stateful_mode: true,
        sse_keep_alive: Some(Duration::from_secs(15)),
        json_response: false,
        ..Default::default()
    };

    let mcp_state = state.clone();
    let service = StreamableHttpService::new(
        move || Ok(FerriteMcpServer::new(mcp_state.clone())),
        Arc::new(LocalSessionManager::default()),
        config,
    );

    axum::Router::new()
        .nest_service("/mcp", service)
        .layer(axum::middleware::from_fn_with_state(state.clone(), vault_guard))
        .with_state(state)
}
