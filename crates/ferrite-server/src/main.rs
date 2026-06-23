use clap::Parser;
use ferrite_server::ServerConfig;

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

    /// MCP server port (0 to disable)
    #[arg(long, default_value = "0")]
    mcp_port: u16,
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

    ferrite_server::run(ServerConfig {
        port: cli.port,
        standalone: cli.standalone,
        dev: cli.dev,
        data_dir: cli.data_dir,
        mcp_port: cli.mcp_port,
    })
    .await
}
