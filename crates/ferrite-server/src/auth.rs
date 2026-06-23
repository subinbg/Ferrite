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

    // In standalone mode, skip token auth.
    // SECURITY: This is safe because the server binds to 127.0.0.1 only (main.rs).
    // No external network access is possible. The frontend runs in the same browser.
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
            if constant_time_eq(&header.as_bytes()[7..], state.token.as_bytes()) {
                Ok(next.run(request).await)
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        _ => Err(StatusCode::UNAUTHORIZED),
    }
}

/// Compare two byte slices without leaking length/content via timing.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    use subtle::ConstantTimeEq;
    a.len() == b.len() && a.ct_eq(b).into()
}
