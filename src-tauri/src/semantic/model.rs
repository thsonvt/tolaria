use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_MODEL_ID: &str = "sentence-transformers/all-MiniLM-L6-v2";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticModelStatus {
    NotDownloaded,
    Ready,
    Failed,
}

#[derive(Debug, Clone)]
pub struct SemanticModelManifest {
    pub id: &'static str,
    pub file_name: &'static str,
    pub sha256: &'static str,
    pub primary_url: &'static str,
}

pub fn model_cache_path(cache_root: &Path, manifest: &SemanticModelManifest) -> PathBuf {
    cache_root.join("models").join(manifest.file_name)
}

pub fn verify_sha256(path: &Path, expected_hex: &str) -> Result<bool, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read model file: {e}"))?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{digest:x}").eq_ignore_ascii_case(expected_hex))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_cache_path_uses_safe_filename() {
        let root = PathBuf::from("/tmp/laputa-cache");
        let manifest = SemanticModelManifest {
            id: DEFAULT_MODEL_ID,
            file_name: "all-MiniLM-L6-v2.onnx",
            sha256: "abc",
            primary_url: "https://example.invalid/model.onnx",
        };

        assert_eq!(
            model_cache_path(&root, &manifest),
            PathBuf::from("/tmp/laputa-cache/models/all-MiniLM-L6-v2.onnx"),
        );
    }

    #[test]
    fn sha256_verification_accepts_matching_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("model.onnx");
        fs::write(&path, b"model-bytes").unwrap();
        let expected = "357e5d6fafa34d27360fec24b4326d3534905e33c6acdee60198fb078b7b79e5";

        assert!(verify_sha256(&path, expected).unwrap());
        assert!(!verify_sha256(&path, "bad").unwrap());
    }
}
