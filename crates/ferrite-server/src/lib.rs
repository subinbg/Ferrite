pub mod app;
pub mod auth;
pub mod dto;
pub mod routes;
pub mod state;

use app::RouterConfig;
use ferrite_store::store::AppStore;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub dev: bool,
    pub db_file: PathBuf,
    pub mcp_port: Option<u16>,
}

struct McpServerHandle {
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

pub async fn run(config: ServerConfig) -> anyhow::Result<()> {
    let token = generate_token();
    let db_path = config.db_file;
    if let Some(parent) = db_path.parent()
        && !parent.as_os_str().is_empty()
    {
        std::fs::create_dir_all(parent)?;
    }
    tracing::info!("Database file: {}", db_path.display());
    let store = AppStore::open(&db_path)?;
    tracing::info!("Opened app database");

    let state = state::AppState::new(token.clone(), store);
    let shutdown_state = state.clone();
    let mcp_state_ref = state.clone();
    let router = app::create_router(state, RouterConfig { dev: config.dev });

    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
    let listener = TcpListener::bind(addr).await?;
    let actual_addr = listener.local_addr()?;

    println!("FERRITE_PORT={}", actual_addr.port());
    println!("FERRITE_TOKEN={token}");
    println!("FERRITE_READY");

    let mcp_server = if let Some(port) = config.mcp_port {
        start_mcp_server(mcp_state_ref, port).await
    } else {
        None
    };

    tracing::info!("Ferrite server listening on {}", actual_addr);

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    if let Some(mcp_server) = mcp_server {
        let _ = mcp_server.shutdown.send(());
        if tokio::time::timeout(Duration::from_secs(2), mcp_server.task)
            .await
            .is_err()
        {
            tracing::warn!("Timed out while waiting for MCP server shutdown");
        }
    }

    tracing::info!("Shutting down: closing database connections");
    {
        let mut pool_mgr = shutdown_state.pool_manager.write().await;
        pool_mgr.disconnect_all().await;
    }
    tracing::info!("Shutdown complete");

    Ok(())
}

fn generate_token() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    rand::Rng::fill(&mut rand::thread_rng(), &mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

async fn start_mcp_server(state: state::AppState, port: u16) -> Option<McpServerHandle> {
    let mcp_state = ferrite_mcp::state::McpState {
        vault: state.vault.clone(),
        pool_manager: state.pool_manager.clone(),
        store: state.store.clone(),
    };
    let mcp_addr = SocketAddr::from(([127, 0, 0, 1], port));
    match TcpListener::bind(mcp_addr).await {
        Ok(mcp_listener) => {
            let mcp_router = ferrite_mcp::create_mcp_router(mcp_state);
            let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
            tracing::info!("MCP server listening on http://127.0.0.1:{port}/mcp");
            let task = tokio::spawn(async move {
                let shutdown = async {
                    let _ = shutdown_rx.await;
                    tracing::info!("Shutting down MCP server");
                };
                if let Err(e) = axum::serve(mcp_listener, mcp_router)
                    .with_graceful_shutdown(shutdown)
                    .await
                {
                    tracing::error!("MCP server error: {e}");
                }
            });
            Some(McpServerHandle {
                shutdown: shutdown_tx,
                task,
            })
        }
        Err(e) => {
            tracing::warn!("Could not start MCP server on port {port}: {e}");
            None
        }
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to register SIGTERM handler");
        let sigint = tokio::signal::ctrl_c();
        tokio::select! {
            _ = sigterm.recv() => tracing::info!("Received SIGTERM"),
            _ = sigint => tracing::info!("Received SIGINT"),
        }
    }

    #[cfg(not(unix))]
    {
        if let Err(e) = tokio::signal::ctrl_c().await {
            tracing::warn!("Failed to listen for shutdown signal: {e}");
        } else {
            tracing::info!("Received CTRL-C");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state;

    fn test_state() -> state::AppState {
        let store = AppStore::open_memory().unwrap();
        state::AppState::new("test-token".to_string(), store)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = app::create_router(test_state(), RouterConfig { dev: false });
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let client = reqwest::Client::new();
        let resp = client
            .get(format!("http://{}/api/health", addr))
            .send()
            .await
            .unwrap();

        assert_eq!(resp.status(), 200);
        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["status"], "ok");
    }

    #[tokio::test]
    async fn test_vault_setup_and_connection_crud() {
        let state = test_state();
        let token = state.token.to_string();
        let app = app::create_router(state, RouterConfig { dev: false });
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let client = reqwest::Client::new();
        let base = format!("http://{}", addr);

        let resp = client
            .get(format!("{base}/api/auth/status"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);
        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["initialized"], false);

        let resp = client
            .post(format!("{base}/api/auth/setup"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({"master_password": "test-password-123"}))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);

        let resp = client
            .post(format!("{base}/api/connections"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "name": "Test SQLite",
                "dialect": "sqlite",
                "database_name": ":memory:",
            }))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 201);
        let conn: serde_json::Value = resp.json().await.unwrap();
        let conn_id = conn["id"].as_str().unwrap().to_string();

        let resp = client
            .get(format!("{base}/api/connections"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        let conns: Vec<serde_json::Value> = resp.json().await.unwrap();
        assert_eq!(conns.len(), 1);
        assert_eq!(conns[0]["name"], "Test SQLite");

        let resp = client
            .delete(format!("{base}/api/connections/{conn_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 204);

        let resp = client
            .get(format!("{base}/api/connections"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        let conns: Vec<serde_json::Value> = resp.json().await.unwrap();
        assert_eq!(conns.len(), 0);
    }
}
