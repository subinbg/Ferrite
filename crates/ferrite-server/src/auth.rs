use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::state::AppState;

pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Health endpoint is exempt from auth
    if request.uri().path() == "/api/health" {
        return Ok(next.run(request).await);
    }

    // In standalone mode, skip token auth (localhost only, no Electron IPC)
    if state.standalone {
        return Ok(next.run(request).await);
    }

    // Only enforce auth on /api/ and /ws/ routes
    let path = request.uri().path();
    if !path.starts_with("/api/") && !path.starts_with("/ws/") {
        return Ok(next.run(request).await);
    }

    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            let token = &header[7..];
            if token == state.token.as_str() {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}
