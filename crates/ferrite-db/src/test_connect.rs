#[cfg(test)]
mod pg_connect_test {
    use sqlx::ConnectOptions;
    use sqlx::postgres::{PgConnectOptions, PgSslMode};

    #[tokio::test]
    async fn test_pg_real_connection() {
        // Load from env: PG_HOST, PG_USER, PG_PASS, PG_DB
        let host = match std::env::var("PG_HOST") {
            Ok(h) => h,
            Err(_) => {
                eprintln!("PG_HOST not set, skipping real PG test");
                return;
            }
        };
        let user = std::env::var("PG_USER").unwrap_or_else(|_| "postgres".into());
        let pass = std::env::var("PG_PASS").unwrap_or_default();
        let db = std::env::var("PG_DB").unwrap_or_else(|_| "postgres".into());
        let port: u16 = std::env::var("PG_PORT")
            .ok()
            .and_then(|p| p.parse().ok())
            .unwrap_or(5432);

        eprintln!("Connecting to {user}@{host}:{port}/{db} ...");

        for mode in [PgSslMode::Prefer, PgSslMode::Require, PgSslMode::Disable] {
            let label = format!("{mode:?}");
            eprintln!("\n--- ssl_mode={label} ---");

            let opts = PgConnectOptions::new()
                .host(&host)
                .port(port)
                .database(&db)
                .username(&user)
                .password(&pass)
                .ssl_mode(mode)
                .log_statements(tracing::log::LevelFilter::Off);

            match sqlx::postgres::PgPoolOptions::new()
                .max_connections(1)
                .acquire_timeout(std::time::Duration::from_secs(10))
                .connect_with(opts)
                .await
            {
                Ok(pool) => {
                    match sqlx::query("SELECT 1 as n").fetch_one(&pool).await {
                        Ok(_) => eprintln!("  SUCCESS: connected and queried"),
                        Err(e) => eprintln!("  Connected but query failed: {e}"),
                    }
                    pool.close().await;
                    return; // One mode worked, pass the test
                }
                Err(e) => {
                    eprintln!("  FAILED: {e}");
                }
            }
        }
        panic!("All SSL modes failed to connect");
    }
}
