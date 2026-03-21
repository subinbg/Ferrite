use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

/// A string wrapper that zeroizes memory on drop and never serializes its contents.
#[derive(Clone)]
pub struct SecureString(Zeroizing<String>);

impl SecureString {
    pub fn new(s: String) -> Self {
        Self(Zeroizing::new(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

impl std::fmt::Debug for SecureString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SecureString(***)")
    }
}

impl Serialize for SecureString {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str("***")
    }
}

impl<'de> Deserialize<'de> for SecureString {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let s = String::deserialize(deserializer)?;
        Ok(Self::new(s))
    }
}

impl Drop for SecureString {
    fn drop(&mut self) {
        // Zeroizing handles this, but be explicit
    }
}

/// A byte buffer that zeroizes on drop.
pub struct SecureBytes(Zeroizing<Vec<u8>>);

impl SecureBytes {
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(Zeroizing::new(bytes))
    }

    pub fn as_slice(&self) -> &[u8] {
        &self.0
    }

    pub fn into_inner(mut self) -> Vec<u8> {
        let mut result = Vec::new();
        std::mem::swap(&mut result, &mut self.0);
        result
    }
}

impl std::fmt::Debug for SecureBytes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SecureBytes(***)")
    }
}

/// A fixed-size key that zeroizes on drop.
pub struct SecureKey([u8; 32]);

impl SecureKey {
    pub fn from_slice(slice: &[u8]) -> Option<Self> {
        if slice.len() != 32 {
            return None;
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(slice);
        Some(Self(key))
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl Drop for SecureKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

impl std::fmt::Debug for SecureKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("SecureKey(***)")
    }
}
