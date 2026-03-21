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
}

fn generate_token() -> String {
    use base64::Engine;
    let mut bytes = [0u8; 32];
    rand::Rng::fill(&mut rand::thread_rng(), &mut bytes);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "ferrite_server=info,tower_http=info".into()),
        )
        .init();

    let cli = Cli::parse();
    let token = generate_token();

    // Initialize local SQLite store
    let data_dir = if let Some(ref dir) = cli.data_dir {
        dir.clone()
    } else if cli.standalone {
        // Standalone mode: store data next to the binary
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
        exe_dir.join("ferrite-data")
    } else {
        // Electron sidecar mode: use OS app data dir
        let base = dirs::data_dir()
            .ok_or_else(|| anyhow::anyhow!("no data directory found"))?;
        base.join("ferrite")
    };
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("ferrite.db");
    tracing::info!("Data dir: {}", data_dir.display());
    let store = AppStore::open(&db_path)?;
    tracing::info!("Opened app database");

    let state = state::AppState::new(token.clone(), store, cli.standalone);
    let shutdown_state = state.clone();
    let router = app::create_router(state, cli.standalone);

    let addr = SocketAddr::from(([127, 0, 0, 1], cli.port));
    let listener = TcpListener::bind(addr).await?;
    let actual_addr = listener.local_addr()?;

    // Print port and token for the Electron sidecar to parse
    println!("FERRITE_PORT={}", actual_addr.port());
    println!("FERRITE_TOKEN={}", token);
    println!("FERRITE_READY");

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

    // Cleanup: close all database connection pools
    tracing::info!("Shutting down — closing database connections...");
    {
        let mut pool_mgr = shutdown_state.pool_manager.write().await;
        pool_mgr.disconnect_all().await;
    }
    tracing::info!("Shutdown complete");

    Ok(())
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
