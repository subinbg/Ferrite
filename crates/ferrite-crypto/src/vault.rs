use aes_gcm::{
    Aes256Gcm, Key, Nonce,
    aead::{Aead, KeyInit, OsRng},
};
use argon2::{Argon2, password_hash::SaltString};
use rand::RngCore;
use thiserror::Error;

use crate::secure::SecureKey;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Encryption failed: {0}")]
    Encrypt(String),
    #[error("Decryption failed: {0}")]
    Decrypt(String),
    #[error("Key derivation failed: {0}")]
    KeyDerivation(String),
    #[error("Invalid master password")]
    InvalidPassword,
    #[error("Vault not initialized")]
    NotInitialized,
}

/// Encrypted data with its nonce.
#[derive(Debug, Clone)]
pub struct EncryptedData {
    pub ciphertext: Vec<u8>,
    pub nonce: Vec<u8>,
}

/// Result of initial vault setup — salt + verification ciphertext.
#[derive(Debug, Clone)]
pub struct VaultSetupData {
    pub salt: String,
    pub verification: EncryptedData,
}

const VERIFICATION_PLAINTEXT: &[u8] = b"FERRITE_VAULT_OK";

/// The MasterVault holds a derived encryption key and provides encrypt/decrypt operations.
pub struct MasterVault {
    key: SecureKey,
}

impl MasterVault {
    /// First-time setup: derive a key from the master password, return salt + verification data.
    pub fn setup(password: &str) -> Result<(Self, VaultSetupData), VaultError> {
        let salt = SaltString::generate(&mut OsRng);
        let key = derive_key(password, &salt)?;
        let vault = Self { key };

        // Create verification ciphertext so we can verify the password on future unlocks
        let verification = vault.encrypt(VERIFICATION_PLAINTEXT)?;

        let setup_data = VaultSetupData {
            salt: salt.to_string(),
            verification,
        };

        Ok((vault, setup_data))
    }

    /// Unlock an existing vault by re-deriving the key and verifying against stored data.
    pub fn unlock(
        password: &str,
        salt_str: &str,
        verification: &EncryptedData,
    ) -> Result<Self, VaultError> {
        let salt = SaltString::from_b64(salt_str)
            .map_err(|e| VaultError::KeyDerivation(format!("invalid salt: {e}")))?;
        let key = derive_key(password, &salt)?;
        let vault = Self { key };

        // Verify by decrypting the verification ciphertext
        let decrypted = vault.decrypt(verification)?;
        if decrypted != VERIFICATION_PLAINTEXT {
            return Err(VaultError::InvalidPassword);
        }

        Ok(vault)
    }

    /// Encrypt plaintext bytes, returning ciphertext + nonce.
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<EncryptedData, VaultError> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(self.key.as_bytes()));
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| VaultError::Encrypt(e.to_string()))?;

        Ok(EncryptedData {
            ciphertext,
            nonce: nonce_bytes.to_vec(),
        })
    }

    /// Decrypt ciphertext using the stored nonce.
    pub fn decrypt(&self, data: &EncryptedData) -> Result<Vec<u8>, VaultError> {
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(self.key.as_bytes()));
        let nonce = Nonce::from_slice(&data.nonce);

        cipher
            .decrypt(nonce, data.ciphertext.as_ref())
            .map_err(|_| VaultError::InvalidPassword)
    }

    /// Encrypt a string, returning encrypted data.
    pub fn encrypt_string(&self, plaintext: &str) -> Result<EncryptedData, VaultError> {
        self.encrypt(plaintext.as_bytes())
    }

    /// Decrypt to a string.
    pub fn decrypt_string(&self, data: &EncryptedData) -> Result<String, VaultError> {
        let bytes = self.decrypt(data)?;
        String::from_utf8(bytes).map_err(|e| VaultError::Decrypt(e.to_string()))
    }
}

fn derive_key(password: &str, salt: &SaltString) -> Result<SecureKey, VaultError> {
    let argon2 = Argon2::default();

    // Use low-level API to get raw key bytes
    let mut key_bytes = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt.as_str().as_bytes(), &mut key_bytes)
        .map_err(|e| VaultError::KeyDerivation(e.to_string()))?;

    SecureKey::from_slice(&key_bytes).ok_or(VaultError::KeyDerivation("key size mismatch".into()))
}

impl std::fmt::Debug for MasterVault {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MasterVault(***)")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_setup_and_unlock() {
        let password = "test-master-password-123";
        let (vault, setup) = MasterVault::setup(password).unwrap();

        // Encrypt something
        let encrypted = vault.encrypt_string("my-database-password").unwrap();
        let decrypted = vault.decrypt_string(&encrypted).unwrap();
        assert_eq!(decrypted, "my-database-password");

        // Unlock with correct password
        let vault2 = MasterVault::unlock(password, &setup.salt, &setup.verification).unwrap();
        let decrypted2 = vault2.decrypt_string(&encrypted).unwrap();
        assert_eq!(decrypted2, "my-database-password");

        // Unlock with wrong password should fail
        let result = MasterVault::unlock("wrong-password", &setup.salt, &setup.verification);
        assert!(result.is_err());
    }

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let (vault, _) = MasterVault::setup("password").unwrap();

        let plaintext = "Hello, Ferrite!";
        let encrypted = vault.encrypt_string(plaintext).unwrap();
        let decrypted = vault.decrypt_string(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_different_nonces() {
        let (vault, _) = MasterVault::setup("password").unwrap();

        let e1 = vault.encrypt(b"same data").unwrap();
        let e2 = vault.encrypt(b"same data").unwrap();

        // Nonces should differ (different random values)
        assert_ne!(e1.nonce, e2.nonce);
        // Ciphertexts should differ (due to different nonces)
        assert_ne!(e1.ciphertext, e2.ciphertext);
    }
}
