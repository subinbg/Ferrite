mod app;
mod auth;
mod embedded;
mod routes;
mod state;
mod ws;

use clap::Parser;
use ferrite_store::store::AppStore;
use std::net::SocketAddr;
use tokio::net::TcpListener;

#[derive(Parser, Debug)]
#[command(name = "ferrite", about = "Ferrite Database Studio")]
struct Cli {
    /// Port to bind to (0 for random)
    #[arg(short, long, default_value = "0")]
    port: u16,

    /// Run in standalone mode (opens browser)
    #[arg(long)]
    standalone: bool,

    /// Enable dev mode (CORS for Vite dev server)
    #[arg(long)]
    dev: bool,

    /// Path to the data directory (default: OS app data dir)
    #[arg(long, short = 'd')]
    data_dir: Option<std::path::PathBuf>,

    /// MCP server port (0 to disable, default: 26260)
    #[arg(long, default_value = "26260")]
    mcp_port: u16,
}

fn generate_token() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    rand::Rng::fill(&mut rand::thread_rng(), &mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ferrite_server=info,tower_http=info".into()),
        )
        .init();

    let token = generate_token();
    let data_dir = resolve_data_dir(cli.data_dir.as_ref(), cli.standalone)?;
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("ferrite.db");
    tracing::info!("Data dir: {}", data_dir.display());
    let store = AppStore::open(&db_path)?;
    tracing::info!("Opened app database");

    let state = state::AppState::new(token.clone(), store, cli.standalone);
    let shutdown_state = state.clone();
    let mcp_state_ref = state.clone();
    let router = app::create_router(state, cli.standalone);

    let addr = SocketAddr::from(([127, 0, 0, 1], cli.port));
    let listener = TcpListener::bind(addr).await?;
    let actual_addr = listener.local_addr()?;

    // Print port and token for the Electron sidecar to parse
    println!("FERRITE_PORT={}", actual_addr.port());
    println!("FERRITE_TOKEN={}", token);
    println!("FERRITE_READY");

    // Start MCP server on a separate fixed port (for Claude Code / AI agent access)
    if cli.mcp_port > 0 {
        let mcp_state = ferrite_mcp::tools::McpState {
            vault: mcp_state_ref.vault.clone(),
            pool_manager: mcp_state_ref.pool_manager.clone(),
            store: mcp_state_ref.store.clone(),
        };
        let mcp_addr = SocketAddr::from(([127, 0, 0, 1], cli.mcp_port));
        match TcpListener::bind(mcp_addr).await {
            Ok(mcp_listener) => {
                let mcp_router = ferrite_mcp::create_mcp_router(mcp_state);
                tracing::info!("MCP server listening on http://127.0.0.1:{}/mcp", cli.mcp_port);
                tokio::spawn(async move {
                    if let Err(e) = axum::serve(mcp_listener, mcp_router).await {
                        tracing::error!("MCP server error: {e}");
                    }
                });
            }
            Err(e) => {
                tracing::warn!("Could not start MCP server on port {}: {e}", cli.mcp_port);
            }
        }
    }

    if cli.standalone {
        let url = format!("http://127.0.0.1:{}", actual_addr.port());
        tracing::info!("Ferrite running at {url}");
        eprintln!("\n  Ferrite Database Studio\n  {url}\n");
        if let Err(e) = open::that(&url) {
            tracing::warn!("Could not open browser: {e}");
        }
    } else {
        tracing::info!("Ferrite server listening on {}", actual_addr);
    }

    // Graceful shutdown on SIGTERM/SIGINT
    let shutdown_signal = async {
        let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to register SIGTERM handler");
        let sigint = tokio::signal::ctrl_c();
        tokio::select! {
            _ = sigterm.recv() => tracing::info!("Received SIGTERM"),
            _ = sigint => tracing::info!("Received SIGINT"),
        }
    };

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    // Cleanup
    tracing::info!("Shutting down — closing database connections...");
    {
        let mut pool_mgr = shutdown_state.pool_manager.write().await;
        pool_mgr.disconnect_all().await;
    }
    tracing::info!("Shutdown complete");

    Ok(())
}

fn resolve_data_dir(
    explicit: Option<&std::path::PathBuf>,
    standalone: bool,
) -> anyhow::Result<std::path::PathBuf> {
    if let Some(dir) = explicit {
        return Ok(dir.clone());
    }
    if standalone {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
        return Ok(exe_dir.join("ferrite-data"));
    }
    let base = dirs::data_dir()
        .ok_or_else(|| anyhow::anyhow!("no data directory found"))?;
    Ok(base.join("ferrite"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state() -> state::AppState {
        let store = AppStore::open_memory().unwrap();
        state::AppState::new("test-token".to_string(), store, false)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = app::create_router(test_state(), true);
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
        let app = app::create_router(state, true);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let client = reqwest::Client::new();
        let base = format!("http://{}", addr);

        // 1. Check vault status — should be uninitialized
        let resp = client
            .get(format!("{base}/api/auth/status"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);
        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["initialized"], false);

        // 2. Setup vault
        let resp = client
            .post(format!("{base}/api/auth/setup"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({"master_password": "test-password-123"}))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 200);

        // 3. Create a connection
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

        // 4. List connections
        let resp = client
            .get(format!("{base}/api/connections"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        let conns: Vec<serde_json::Value> = resp.json().await.unwrap();
        assert_eq!(conns.len(), 1);
        assert_eq!(conns[0]["name"], "Test SQLite");

        // 5. Delete connection
        let resp = client
            .delete(format!("{base}/api/connections/{conn_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 204);

        // 6. Verify deletion
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
