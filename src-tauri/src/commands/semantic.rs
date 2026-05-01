use crate::search::SearchResponse;
use crate::semantic::{
    chunk_note, query_index, ChunkRecord, FastEmbedder, SemanticEmbedder, SemanticIndex,
    SemanticNoteInput, SemanticStatus, SemanticStatusStore, DEFAULT_MODEL_ID,
};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;
use walkdir::WalkDir;

const CHUNK_MAX_WORDS: usize = 512;

#[tauri::command]
pub fn semantic_index_status() -> SemanticStatus {
    SemanticStatusStore::default().snapshot()
}

#[tauri::command]
pub async fn rebuild_semantic_index(_vault_path: String) -> Result<SemanticStatus, String> {
    Err("semantic rebuild is not implemented".to_string())
}

#[tauri::command]
pub async fn search_vault_semantic(
    vault_path: String,
    query: String,
    limit: usize,
) -> Result<SearchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut embedder = FastEmbedder::new()?;
        build_and_query_with_embedder(&vault_path, &query, limit, &mut embedder)
    })
    .await
    .map_err(|e| format!("Semantic search task failed: {e}"))?
}

pub fn build_and_query_with_embedder(
    vault_path: &str,
    query: &str,
    limit: usize,
    embedder: &mut dyn SemanticEmbedder,
) -> Result<SearchResponse, String> {
    let start = Instant::now();
    let vault_dir = Path::new(vault_path);
    let mut index = SemanticIndex::new(DEFAULT_MODEL_ID, "v1");

    for path in collect_markdown_paths(vault_dir) {
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read semantic note {}: {e}", path.display()))?;
        let entry = crate::vault::parse_md_file(&path, None)?;
        let note = SemanticNoteInput {
            path: entry.path.clone(),
            title: entry.title.clone(),
            note_type: entry.is_a.clone(),
            aliases: entry.aliases.clone(),
            properties: scalar_properties(entry.properties),
            relationships: entry.relationships.clone(),
            outgoing_links: entry.outgoing_links.clone(),
            content,
        };
        let chunks = chunk_note(&note, CHUNK_MAX_WORDS);
        let embeddings = embedder.embed_passages(
            chunks
                .iter()
                .map(|chunk| chunk.text.clone())
                .collect::<Vec<_>>(),
        )?;
        if embeddings.len() != chunks.len() {
            return Err(format!(
                "Semantic embedder returned {} vectors for {} chunks",
                embeddings.len(),
                chunks.len()
            ));
        }

        let chunk_records = chunks
            .into_iter()
            .zip(embeddings.into_iter())
            .map(|(chunk, embedding)| {
                let text_hash = sha256_hex(chunk.text.as_bytes());
                ChunkRecord {
                    chunk_id: format!("{}#{}:{text_hash}", chunk.note_path, chunk.chunk_index),
                    note_path: chunk.note_path,
                    title: note.title.clone(),
                    note_type: note.note_type.clone(),
                    aliases: note.aliases.clone(),
                    properties: note.properties.clone(),
                    relationships: note.relationships.clone(),
                    outgoing_links: note.outgoing_links.clone(),
                    text: chunk.text,
                    text_hash,
                    embedding,
                }
            })
            .collect::<Vec<_>>();

        index.upsert_note(&note.path, &sha256_hex(note.content.as_bytes()), chunk_records);
    }

    let query_embedding = embedder.embed_query(query)?;
    Ok(query_index(
        &index,
        &query_embedding,
        query,
        limit,
        start.elapsed().as_millis() as u64,
    ))
}

fn collect_markdown_paths(vault_dir: &Path) -> Vec<PathBuf> {
    let paths = WalkDir::new(vault_dir)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.into_path())
        .filter(|path| is_markdown_candidate(path))
        .collect::<Vec<_>>();

    crate::vault::filter_gitignored_paths(
        vault_dir,
        paths,
        crate::settings::hide_gitignored_files_enabled(),
    )
}

fn is_markdown_candidate(path: &Path) -> bool {
    path.is_file()
        && path.extension().is_some_and(|ext| ext == "md")
        && !path
            .components()
            .any(|component| component.as_os_str().to_string_lossy().starts_with('.'))
}

fn scalar_properties(properties: HashMap<String, Value>) -> HashMap<String, String> {
    properties
        .into_iter()
        .filter_map(|(key, value)| match value {
            Value::String(value) => Some((key, value)),
            Value::Number(value) => Some((key, value.to_string())),
            Value::Bool(value) => Some((key, value.to_string())),
            _ => None,
        })
        .collect()
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_command_starts_disabled() {
        let status = semantic_index_status();

        assert_eq!(status.enabled, false);
    }
}

#[cfg(test)]
mod command_search_tests {
    use super::*;
    use crate::semantic::SemanticEmbedder;
    use std::fs;
    use std::path::Path;

    struct KeywordFakeEmbedder;

    impl SemanticEmbedder for KeywordFakeEmbedder {
        fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
            Ok(passages
                .into_iter()
                .map(|text| {
                    let lower = text.to_lowercase();
                    if lower.contains("author: shau") || lower.contains("apollo") {
                        vec![1.0, 0.0]
                    } else {
                        vec![0.0, 1.0]
                    }
                })
                .collect())
        }

        fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
            if query.to_lowercase().contains("shau") {
                Ok(vec![1.0, 0.0])
            } else {
                Ok(vec![0.0, 1.0])
            }
        }
    }

    fn write_note(root: &Path, name: &str, content: &str) {
        fs::write(root.join(name), content).unwrap();
    }

    #[test]
    fn semantic_fixture_finds_frontmatter_author() {
        let dir = tempfile::Builder::new()
            .prefix("semantic-command-")
            .tempdir_in(std::env::current_dir().unwrap())
            .unwrap();
        write_note(
            dir.path(),
            "apollo.md",
            "---\nisA: Project\nauthor: Shau\n---\n# Apollo\n\nLunar planning notes.",
        );
        write_note(
            dir.path(),
            "bread.md",
            "---\nisA: Recipe\nauthor: Mina\n---\n# Bread\n\nSourdough notes.",
        );
        let mut embedder = KeywordFakeEmbedder;

        let response = build_and_query_with_embedder(
            dir.path().to_str().unwrap(),
            "notes by Shau",
            10,
            &mut embedder,
        )
        .unwrap();

        assert_eq!(response.results[0].title, "Apollo");
        assert!(response.results[0].snippet.contains("author: Shau"));
    }
}
