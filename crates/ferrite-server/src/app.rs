use axum::{
    Router,
    extract::State,
    middleware,
    routing::{get, post, put},
};
use serde_json::json;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};

use crate::auth::auth_middleware;
use axum::routing::delete;
use crate::routes::{connections, export, history, query, schema, settings};
use crate::state::AppState;

async fn health(State(state): State<AppState>) -> axum::Json<serde_json::Value> {
    axum::Json(json!({
        "status": "ok",
        "version": state.version,
    }))
}

pub fn create_router(state: AppState, standalone: bool) -> Router {
    // Restrict CORS to localhost only — Ferrite binds to 127.0.0.1
    let cors = CorsLayer::new()
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_origin([
            "http://127.0.0.1".parse().unwrap(),
            "http://localhost".parse().unwrap(),
            // Vite dev server
            "http://localhost:5173".parse().unwrap(),
            "http://127.0.0.1:5173".parse().unwrap(),
        ]);

    let connection_routes = Router::new()
        .route("/", get(connections::list_connections).post(connections::create_connection))
        .route(
            "/{id}",
            put(connections::update_connection).delete(connections::delete_connection),
        )
        .route("/{id}/test", post(connections::test_connection))
        .route("/{id}/connect", post(connections::connect_connection))
        .route("/{id}/disconnect", post(connections::disconnect_connection))
        .route("/{id}/schemas", get(schema::list_schemas))
        .route("/{id}/tables", get(schema::list_tables))
        .route("/{id}/tables/{table}/columns", get(schema::list_columns))
        .route("/{id}/full-schema", get(schema::full_schema));

    let auth_routes = Router::new()
        .route("/status", get(settings::vault_status))
        .route("/setup", post(settings::setup_vault))
        .route("/unlock", post(settings::unlock_vault));

    let query_routes = Router::new()
        .route("/execute", post(query::execute_query))
        .route("/explain", post(query::explain_query));

    let history_routes = Router::new()
        .route("/", get(query::list_history))
        .route("/{id}", delete(query::delete_history));

    let version_routes = Router::new()
        .route("/", get(history::list_versions).post(history::create_version))
        .route("/{id}", put(history::update_version).delete(history::delete_version))
        .route("/{id}/diff/{other_id}", get(history::diff_versions));

    let api_routes = Router::new()
        .route("/health", get(health))
        .nest("/connections", connection_routes)
        .nest("/auth", auth_routes)
        .nest("/query", query_routes)
        .nest("/history", history_routes)
        .nest("/versions", version_routes)
        .route("/export", post(export::export_data));

    let mut router = Router::new()
        .nest("/api", api_routes);

    // In standalone mode, serve embedded frontend assets
    if standalone {
        router = router.fallback(get(crate::embedded::serve_frontend));
    }

    router
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}
