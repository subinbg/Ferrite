use thiserror::Error;

const SERVICE_NAME: &str = "ferrite-db-studio";
const MASTER_USER: &str = "master-password";

#[derive(Error, Debug)]
pub enum KeychainError {
    #[error("Keychain error: {0}")]
    Access(String),
    #[error("No password stored in keychain")]
    NotFound,
}

/// Store the master password in the OS keychain for passwordless unlock.
pub fn store_master_password(password: &str) -> Result<(), KeychainError> {
    let entry = keyring::Entry::new(SERVICE_NAME, MASTER_USER)
        .map_err(|e| KeychainError::Access(e.to_string()))?;
    entry
        .set_password(password)
        .map_err(|e| KeychainError::Access(e.to_string()))
}

/// Retrieve the master password from the OS keychain.
pub fn retrieve_master_password() -> Result<String, KeychainError> {
    let entry = keyring::Entry::new(SERVICE_NAME, MASTER_USER)
        .map_err(|e| KeychainError::Access(e.to_string()))?;
    entry.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => KeychainError::NotFound,
        other => KeychainError::Access(other.to_string()),
    })
}

/// Delete the master password from the OS keychain.
pub fn delete_master_password() -> Result<(), KeychainError> {
    let entry = keyring::Entry::new(SERVICE_NAME, MASTER_USER)
        .map_err(|e| KeychainError::Access(e.to_string()))?;
    entry.delete_credential().map_err(|e| match e {
        keyring::Error::NoEntry => KeychainError::NotFound,
        other => KeychainError::Access(other.to_string()),
    })
}
