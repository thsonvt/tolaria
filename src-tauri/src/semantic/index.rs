use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChunkRecord {
    pub chunk_id: String,
    pub note_path: String,
    pub title: String,
    pub note_type: Option<String>,
    pub aliases: Vec<String>,
    pub properties: HashMap<String, String>,
    pub relationships: HashMap<String, Vec<String>>,
    pub outgoing_links: Vec<String>,
    pub text: String,
    pub text_hash: String,
    pub embedding: Vec<f32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SemanticIndex {
    pub model_id: String,
    pub model_version: String,
    pub note_hashes: HashMap<String, String>,
    pub chunks: Vec<ChunkRecord>,
}

impl SemanticIndex {
    pub fn new(model_id: impl Into<String>, model_version: impl Into<String>) -> Self {
        Self {
            model_id: model_id.into(),
            model_version: model_version.into(),
            note_hashes: HashMap::new(),
            chunks: Vec::new(),
        }
    }

    pub fn upsert_note(&mut self, note_path: &str, note_hash: &str, chunks: Vec<ChunkRecord>) {
        self.delete_note(note_path);
        self.note_hashes
            .insert(note_path.to_string(), note_hash.to_string());
        self.chunks.extend(chunks);
    }

    pub fn delete_note(&mut self, note_path: &str) {
        self.note_hashes.remove(note_path);
        self.chunks.retain(|chunk| chunk.note_path != note_path);
    }
}

pub fn save_index(path: &Path, index: &SemanticIndex) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create semantic index dir: {e}"))?;
    }
    let bytes = bincode::serde::encode_to_vec(index, bincode::config::standard())
        .map_err(|e| format!("Failed to encode semantic index: {e}"))?;
    fs::write(path, bytes).map_err(|e| format!("Failed to write semantic index: {e}"))
}

pub fn load_index(path: &Path) -> Result<SemanticIndex, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read semantic index: {e}"))?;
    bincode::serde::decode_from_slice(&bytes, bincode::config::standard())
        .map(|(index, _)| index)
        .map_err(|e| format!("Failed to decode semantic index: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(path: &str, chunk: usize) -> ChunkRecord {
        ChunkRecord {
            chunk_id: format!("{path}#{chunk}"),
            note_path: path.into(),
            title: "Apollo".into(),
            note_type: Some("Project".into()),
            aliases: vec![],
            properties: HashMap::new(),
            relationships: HashMap::new(),
            outgoing_links: vec![],
            text: "semantic text".into(),
            text_hash: "hash".into(),
            embedding: vec![1.0, 0.0, 0.0],
        }
    }

    #[test]
    fn upsert_replaces_chunks_for_note() {
        let mut index = SemanticIndex::new("model", "v1");

        index.upsert_note("/vault/a.md", "hash-a", vec![record("/vault/a.md", 0)]);
        index.upsert_note(
            "/vault/a.md",
            "hash-b",
            vec![record("/vault/a.md", 0), record("/vault/a.md", 1)],
        );

        assert_eq!(index.note_hashes.get("/vault/a.md").unwrap(), "hash-b");
        assert_eq!(index.chunks.len(), 2);
    }

    #[test]
    fn delete_note_removes_chunks_and_hash() {
        let mut index = SemanticIndex::new("model", "v1");
        index.upsert_note("/vault/a.md", "hash-a", vec![record("/vault/a.md", 0)]);

        index.delete_note("/vault/a.md");

        assert!(index.note_hashes.get("/vault/a.md").is_none());
        assert!(index.chunks.is_empty());
    }

    #[test]
    fn bincode_round_trip_persists_index() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("index.bin");
        let mut index = SemanticIndex::new("model", "v1");
        index.upsert_note("/vault/a.md", "hash-a", vec![record("/vault/a.md", 0)]);

        save_index(&path, &index).unwrap();
        let loaded = load_index(&path).unwrap();

        assert_eq!(loaded, index);
    }
}
