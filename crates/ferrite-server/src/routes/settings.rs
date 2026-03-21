use axum::{
    Json,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Deserialize)]
pub struct SetupRequest {
    pub master_password: String,
}

#[derive(Deserialize)]
pub struct UnlockRequest {
    pub master_password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub vault_initialized: bool,
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

pub async fn vault_status(State(state): State<AppState>) -> impl IntoResponse {
    let store = state.store.lock().await;
    let initialized = store.get_setting("vault_salt").unwrap_or(None).is_some();
    let vault = state.vault.read().await;
    let unlocked = vault.is_some();

    Json(VaultStatus {
        initialized,
        unlocked,
    })
}

pub async fn setup_vault(
    State(state): State<AppState>,
    Json(req): Json<SetupRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use ferrite_crypto::vault::MasterVault;

    let store = state.store.lock().await;

    // Check if already initialized
    if store.get_setting("vault_salt").unwrap_or(None).is_some() {
        return Err((
            StatusCode::CONFLICT,
            "Vault already initialized".to_string(),
        ));
    }

    // Setup the vault
    let (vault, setup_data) = MasterVault::setup(&req.master_password)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Store salt and verification data
    store
        .set_setting("vault_salt", &setup_data.salt)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let verification_json = serde_json::json!({
        "ciphertext": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &setup_data.verification.ciphertext),
        "nonce": base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &setup_data.verification.nonce),
    });
    store
        .set_setting("vault_verification", &verification_json.to_string())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Store vault in app state
    let mut vault_lock = state.vault.write().await;
    *vault_lock = Some(vault);

    Ok(Json(AuthResponse {
        token: state.token.to_string(),
        vault_initialized: true,
    }))
}

pub async fn unlock_vault(
    State(state): State<AppState>,
    Json(req): Json<UnlockRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    use base64::Engine;
    use ferrite_crypto::vault::{EncryptedData, MasterVault};

    let store = state.store.lock().await;

    let salt = store
        .get_setting("vault_salt")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::BAD_REQUEST, "Vault not initialized".to_string()))?;

    let verification_str = store
        .get_setting("vault_verification")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            StatusCode::BAD_REQUEST,
            "Vault verification data missing".to_string(),
        ))?;

    let verification_json: serde_json::Value = serde_json::from_str(&verification_str)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(verification_json["ciphertext"].as_str().unwrap_or(""))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let nonce = base64::engine::general_purpose::STANDARD
        .decode(verification_json["nonce"].as_str().unwrap_or(""))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let verification = EncryptedData { ciphertext, nonce };

    let vault = MasterVault::unlock(&req.master_password, &salt, &verification)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid master password".to_string()))?;

    let mut vault_lock = state.vault.write().await;
    *vault_lock = Some(vault);

    Ok(Json(AuthResponse {
        token: state.token.to_string(),
        vault_initialized: true,
    }))
}
