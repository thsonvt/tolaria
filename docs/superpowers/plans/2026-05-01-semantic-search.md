# Semantic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in, local-only semantic search for Markdown notes while keeping Tolaria's fork-specific code isolated behind a native Rust semantic module boundary.

**Architecture:** The backend owns model readiness, chunking, indexing, and vector queries under `src-tauri/src/semantic/`. Existing Rust and React files only call small semantic commands or render semantic status/search mode. Keyword search remains unchanged and is the fallback whenever semantic search is disabled or unavailable.

**Tech Stack:** Tauri v2, Rust 2021, React 19, TypeScript 5.9, Vitest, Playwright, `fastembed` 5.x, `bincode` 2.x, `sha2`, existing shadcn/ui primitives.

---

## Scope And Source Material

- Approved spec: `docs/superpowers/specs/2026-04-30-semantic-search-design.md`
- Existing prior plan: `docs/plans/2026-04-29-semantic-search-design.md`
- Relevant ADRs: `docs/adr/0009-keyword-only-search.md`, `docs/adr/0010-dynamic-wikilink-relationship-detection.md`, `docs/adr/0024-cache-outside-vault.md`, `docs/adr/0069-neighborhood-mode-for-note-list-relationship-browsing.md`

## File Structure

Create:

- `src-tauri/src/semantic/mod.rs`: public semantic API, command-facing types, module exports.
- `src-tauri/src/semantic/model.rs`: model manifest, app cache paths, SHA-256 verification, model status.
- `src-tauri/src/semantic/embedder.rs`: `fastembed` wrapper and test embedding abstraction.
- `src-tauri/src/semantic/chunker.rs`: Markdown/frontmatter chunking with metadata header.
- `src-tauri/src/semantic/index.rs`: index records, persistence, upsert/delete, stale detection.
- `src-tauri/src/semantic/query.rs`: cosine similarity, chunk-to-note aggregation, result mapping.
- `src-tauri/src/semantic/status.rs`: shared semantic status state for enabled/model/index progress.
- `src-tauri/src/commands/semantic.rs`: Tauri command functions.
- `src/hooks/useSemanticSearchSettings.ts`: frontend command wrapper and polling for semantic status.
- `src/components/SearchModeToggle.tsx`: shadcn-style segmented Keyword/Semantic control.
- `src/components/SearchModeToggle.test.tsx`: mode-control tests.
- `tests/smoke/semantic-search-frontmatter.spec.ts`: Playwright smoke test.
- `docs/adr/0098-local-semantic-search.md`: ADR superseding keyword-only search for opt-in semantic mode.

Modify:

- `src-tauri/Cargo.toml`: add semantic dependencies.
- `src-tauri/src/lib.rs`: expose `semantic` module and register semantic commands.
- `src-tauri/src/commands/mod.rs`: export semantic commands.
- `src-tauri/src/settings.rs`: persist `semantic_search_enabled`.
- `src/types.ts`: add semantic settings/status and narrow `SearchMode` to supported modes.
- `src/hooks/useUnifiedSearch.ts`: call keyword or semantic command based on mode and status.
- `src/components/SearchPanel.tsx`: render mode toggle and semantic disabled/indexing state.
- `src/components/SettingsPanel.tsx`: add Search section with enable, model, index, rebuild controls.
- `src/mock-tauri/mock-handlers.ts`: add semantic command mocks.
- Existing tests near modified files.

## Task 0: Baseline Health And Working Tree

**Files:**
- Read: `.codescene-thresholds`
- Read: `docs/superpowers/specs/2026-04-30-semantic-search-design.md`

- [ ] **Step 1: Confirm branch and dirty state**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
main
```

Record unrelated dirty files. Do not revert user changes.

- [ ] **Step 2: Capture CodeScene project score**

Run the CodeScene MCP project health tool if available:

```text
mcp__codescene__code_health_score
```

Expected: Hotspot and Average scores are at or above `.codescene-thresholds`.

If MCP is unavailable, use the installed `cs` CLI or CodeScene API as described in `AGENTS.md`.

- [ ] **Step 3: Capture initial file-level scores**

Before touching existing code files, capture CodeScene file-level scores for:

```text
src-tauri/src/lib.rs
src-tauri/src/commands/mod.rs
src-tauri/src/settings.rs
src/types.ts
src/hooks/useUnifiedSearch.ts
src/components/SearchPanel.tsx
src/components/SettingsPanel.tsx
src/mock-tauri/mock-handlers.ts
```

Expected: baseline scores recorded in notes for comparison after each task.

## Task 1: Settings Flag

**Files:**
- Modify: `src-tauri/src/settings.rs`
- Modify: `src/types.ts`
- Test: `src-tauri/src/settings.rs`
- Test: `src/hooks/useSettings.test.ts`

- [ ] **Step 1: Write failing Rust settings tests**

Add these tests inside `#[cfg(test)] mod tests` in `src-tauri/src/settings.rs`:

```rust
#[test]
fn test_semantic_search_enabled_defaults_to_none() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");

    let loaded = get_settings_at(&path).unwrap();

    assert_eq!(loaded.semantic_search_enabled, None);
}

#[test]
fn test_save_settings_preserves_semantic_search_enabled() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("settings.json");

    save_settings_at(
        &path,
        Settings {
            semantic_search_enabled: Some(true),
            ..Settings::default()
        },
    )
    .unwrap();

    let loaded = get_settings_at(&path).unwrap();

    assert_eq!(loaded.semantic_search_enabled, Some(true));
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings::tests::test_semantic_search_enabled_defaults_to_none settings::tests::test_save_settings_preserves_semantic_search_enabled
```

Expected: FAIL because `Settings` has no `semantic_search_enabled` field.

- [ ] **Step 3: Add the settings field**

In `src-tauri/src/settings.rs`, add the field to `Settings`:

```rust
pub semantic_search_enabled: Option<bool>,
```

Add it to `normalize_settings`:

```rust
semantic_search_enabled: settings.semantic_search_enabled,
```

In `src/types.ts`, add the matching field to `Settings`:

```ts
semantic_search_enabled?: boolean | null
```

- [ ] **Step 4: Run settings tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml settings::tests::test_semantic_search_enabled_defaults_to_none settings::tests::test_save_settings_preserves_semantic_search_enabled
pnpm exec vitest run src/hooks/useSettings.test.ts
```

Expected: PASS.

- [ ] **Step 5: CodeScene and commit**

Run file-level CodeScene on touched files. Expected: scores are higher than baseline, or remain `10.0` if already `10.0`.

Commit:

```bash
git add src-tauri/src/settings.rs src/types.ts src/hooks/useSettings.test.ts
git commit -m "Persist semantic search enablement"
```

## Task 2: Semantic Types, Status State, And Cache Paths

**Files:**
- Create: `src-tauri/src/semantic/mod.rs`
- Create: `src-tauri/src/semantic/status.rs`
- Create: `src-tauri/src/semantic/model.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/src/semantic/model.rs`
- Test: `src-tauri/src/semantic/status.rs`

- [ ] **Step 1: Add module shell**

Create `src-tauri/src/semantic/mod.rs`:

```rust
pub mod model;
pub mod status;

pub use model::{SemanticModelManifest, SemanticModelStatus};
pub use status::{SemanticIndexState, SemanticStatus, SemanticStatusStore};
```

In `src-tauri/src/lib.rs`, add:

```rust
pub mod semantic;
```

- [ ] **Step 2: Write failing status tests**

Create `src-tauri/src/semantic/status.rs` with tests first:

```rust
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticIndexState {
    Disabled,
    NotReady,
    Indexing,
    Ready,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SemanticStatus {
    pub enabled: bool,
    pub model_ready: bool,
    pub index_state: SemanticIndexState,
    pub indexed_notes: usize,
    pub total_notes: usize,
    pub message: Option<String>,
}

#[derive(Clone, Default)]
pub struct SemanticStatusStore {
    inner: Arc<Mutex<SemanticStatus>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_status_is_disabled() {
        let store = SemanticStatusStore::default();

        assert_eq!(store.snapshot().enabled, false);
        assert_eq!(store.snapshot().index_state, SemanticIndexState::Disabled);
    }

    #[test]
    fn update_replaces_snapshot() {
        let store = SemanticStatusStore::default();

        store.update(SemanticStatus {
            enabled: true,
            model_ready: true,
            index_state: SemanticIndexState::Ready,
            indexed_notes: 3,
            total_notes: 3,
            message: None,
        });

        assert_eq!(store.snapshot().indexed_notes, 3);
        assert_eq!(store.snapshot().index_state, SemanticIndexState::Ready);
    }
}
```

- [ ] **Step 3: Run status tests to verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::status
```

Expected: FAIL because `snapshot` and `update` are not implemented.

- [ ] **Step 4: Implement status store**

Add below the structs in `status.rs`:

```rust
impl Default for SemanticStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            model_ready: false,
            index_state: SemanticIndexState::Disabled,
            indexed_notes: 0,
            total_notes: 0,
            message: None,
        }
    }
}

impl SemanticStatusStore {
    pub fn snapshot(&self) -> SemanticStatus {
        self.inner
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn update(&self, next: SemanticStatus) {
        if let Ok(mut guard) = self.inner.lock() {
            *guard = next;
        }
    }
}
```

- [ ] **Step 5: Write model path/hash tests**

Create `src-tauri/src/semantic/model.rs`:

```rust
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
        let expected = "34f8bdc4b5aa3e7b832bf660bbaeb48019a70f0c7f23911ea73c7bcb84ccb26b";

        assert!(verify_sha256(&path, expected).unwrap());
        assert!(!verify_sha256(&path, "bad").unwrap());
    }
}
```

- [ ] **Step 6: Run model tests to verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::model
```

Expected: FAIL because `model_cache_path` and `verify_sha256` are not implemented, and `sha2` is not yet available.

- [ ] **Step 7: Add dependencies and implementation**

In `src-tauri/Cargo.toml`, add:

```toml
sha2 = "0.10"
```

Add to `model.rs`:

```rust
pub fn model_cache_path(cache_root: &Path, manifest: &SemanticModelManifest) -> PathBuf {
    cache_root.join("models").join(manifest.file_name)
}

pub fn verify_sha256(path: &Path, expected_hex: &str) -> Result<bool, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read model file: {e}"))?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{digest:x}").eq_ignore_ascii_case(expected_hex))
}
```

- [ ] **Step 8: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::status semantic::model
```

Expected: PASS.

Run CodeScene on `src-tauri/src/semantic/*.rs`, `src-tauri/src/lib.rs`, and `src-tauri/Cargo.toml`.

Commit:

```bash
git add src-tauri/src/semantic src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Add semantic search status and model metadata"
```

## Task 3: Chunk Markdown Notes With Metadata Headers

**Files:**
- Create: `src-tauri/src/semantic/chunker.rs`
- Modify: `src-tauri/src/semantic/mod.rs`
- Test: `src-tauri/src/semantic/chunker.rs`

- [ ] **Step 1: Add chunker tests**

Create `src-tauri/src/semantic/chunker.rs`:

```rust
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub struct SemanticNoteInput {
    pub path: String,
    pub title: String,
    pub note_type: Option<String>,
    pub aliases: Vec<String>,
    pub properties: HashMap<String, String>,
    pub relationships: HashMap<String, Vec<String>>,
    pub outgoing_links: Vec<String>,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SemanticChunk {
    pub note_path: String,
    pub chunk_index: usize,
    pub text: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(content: &str) -> SemanticNoteInput {
        SemanticNoteInput {
            path: "/vault/project.md".into(),
            title: "Apollo".into(),
            note_type: Some("Project".into()),
            aliases: vec!["Moonshot".into()],
            properties: HashMap::from([
                ("author".into(), "Shau".into()),
                ("status".into(), "active".into()),
            ]),
            relationships: HashMap::from([("related_to".into(), vec!["[[orbital]]".into()])]),
            outgoing_links: vec!["[[launch]]".into()],
            content: content.into(),
        }
    }

    #[test]
    fn first_chunk_includes_metadata_header() {
        let chunks = chunk_note(&note("# Apollo\n\nBody text"), 512);

        assert_eq!(chunks.len(), 1);
        assert!(chunks[0].text.starts_with("Title: Apollo | Type: Project | Aliases: Moonshot | author: Shau | status: active"));
        assert!(chunks[0].text.contains("Body text"));
    }

    #[test]
    fn splits_on_h2_boundaries() {
        let chunks = chunk_note(&note("# Apollo\n\nIntro\n\n## Phase One\n\nBuild\n\n## Phase Two\n\nLaunch"), 512);

        assert_eq!(chunks.len(), 3);
        assert!(chunks[1].text.contains("Phase One"));
        assert!(chunks[2].text.contains("Phase Two"));
    }

    #[test]
    fn caps_chunks_by_word_count() {
        let long = (0..620).map(|i| format!("word{i}")).collect::<Vec<_>>().join(" ");
        let chunks = chunk_note(&note(&long), 128);

        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|chunk| chunk.text.split_whitespace().count() <= 180));
    }
}
```

- [ ] **Step 2: Export the chunker and run failing tests**

In `src-tauri/src/semantic/mod.rs`, add:

```rust
pub mod chunker;
```

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::chunker
```

Expected: FAIL because `chunk_note` is not implemented.

- [ ] **Step 3: Implement chunking**

Add to `chunker.rs`:

```rust
pub fn chunk_note(note: &SemanticNoteInput, max_words: usize) -> Vec<SemanticChunk> {
    let sections = split_h2_sections(&note.content);
    let header = metadata_header(note);
    let mut chunks = Vec::new();

    for section in sections {
        let prefixed = if chunks.is_empty() {
            format!("{header}\n\n{}", section.trim())
        } else {
            section.trim().to_string()
        };
        for piece in split_by_word_count(&prefixed, max_words) {
            if !piece.trim().is_empty() {
                chunks.push(SemanticChunk {
                    note_path: note.path.clone(),
                    chunk_index: chunks.len(),
                    text: piece,
                });
            }
        }
    }

    chunks
}

fn metadata_header(note: &SemanticNoteInput) -> String {
    let mut parts = vec![format!("Title: {}", note.title)];
    if let Some(note_type) = note.note_type.as_deref().filter(|value| !value.trim().is_empty()) {
        parts.push(format!("Type: {note_type}"));
    }
    if !note.aliases.is_empty() {
        parts.push(format!("Aliases: {}", note.aliases.join(", ")));
    }

    let mut properties = note.properties.iter().collect::<Vec<_>>();
    properties.sort_by(|a, b| a.0.cmp(b.0));
    for (key, value) in properties {
        if !key.starts_with('_') && !value.trim().is_empty() {
            parts.push(format!("{key}: {value}"));
        }
    }

    parts.join(" | ")
}

fn split_h2_sections(content: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current = String::new();

    for line in content.lines() {
        if line.starts_with("## ") && !current.trim().is_empty() {
            sections.push(current);
            current = String::new();
        }
        current.push_str(line);
        current.push('\n');
    }

    if !current.trim().is_empty() {
        sections.push(current);
    }

    sections
}

fn split_by_word_count(text: &str, max_words: usize) -> Vec<String> {
    let words = text.split_whitespace().collect::<Vec<_>>();
    if words.len() <= max_words {
        return vec![text.trim().to_string()];
    }

    words
        .chunks(max_words)
        .map(|chunk| chunk.join(" "))
        .collect()
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::chunker
```

Expected: PASS.

Run CodeScene on `src-tauri/src/semantic/chunker.rs` and `src-tauri/src/semantic/mod.rs`.

Commit:

```bash
git add src-tauri/src/semantic/chunker.rs src-tauri/src/semantic/mod.rs
git commit -m "Chunk Markdown notes for semantic indexing"
```

## Task 4: Persistent Semantic Index

**Files:**
- Create: `src-tauri/src/semantic/index.rs`
- Modify: `src-tauri/src/semantic/mod.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: `src-tauri/src/semantic/index.rs`

- [ ] **Step 1: Add index persistence tests**

Create `src-tauri/src/semantic/index.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

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
```

- [ ] **Step 2: Export module and run failing tests**

In `src-tauri/src/semantic/mod.rs`, add:

```rust
pub mod index;
```

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::index
```

Expected: FAIL because constructors and persistence functions are not implemented, and `bincode` is missing.

- [ ] **Step 3: Add dependency and implementation**

In `src-tauri/Cargo.toml`, add:

```toml
bincode = { version = "2", features = ["serde"] }
```

Add to `index.rs`:

```rust
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
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create semantic index dir: {e}"))?;
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
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::index
```

Expected: PASS.

Run CodeScene on `src-tauri/src/semantic/index.rs`, `src-tauri/src/semantic/mod.rs`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.

Commit:

```bash
git add src-tauri/src/semantic/index.rs src-tauri/src/semantic/mod.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Persist semantic note index"
```

## Task 5: Query Ranking And Result Aggregation

**Files:**
- Create: `src-tauri/src/semantic/query.rs`
- Modify: `src-tauri/src/semantic/mod.rs`
- Test: `src-tauri/src/semantic/query.rs`

- [ ] **Step 1: Add query tests**

Create `src-tauri/src/semantic/query.rs`:

```rust
use crate::search::{SearchResponse, SearchResult};
use super::index::{ChunkRecord, SemanticIndex};

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn chunk(note_path: &str, title: &str, embedding: Vec<f32>, text: &str) -> ChunkRecord {
        ChunkRecord {
            chunk_id: format!("{note_path}#0"),
            note_path: note_path.into(),
            title: title.into(),
            note_type: Some("Project".into()),
            aliases: vec![],
            properties: HashMap::new(),
            relationships: HashMap::new(),
            outgoing_links: vec![],
            text: text.into(),
            text_hash: "hash".into(),
            embedding,
        }
    }

    #[test]
    fn cosine_similarity_orders_matching_note_first() {
        let mut index = SemanticIndex::new("model", "v1");
        index.chunks = vec![
            chunk("/vault/a.md", "Apollo", vec![1.0, 0.0], "moon mission"),
            chunk("/vault/b.md", "Baking", vec![0.0, 1.0], "bread recipe"),
        ];

        let response = query_index(&index, &[1.0, 0.0], "space project", 10, 0);

        assert_eq!(response.results[0].path, "/vault/a.md");
        assert_eq!(response.results[0].title, "Apollo");
    }

    #[test]
    fn multiple_chunks_are_aggregated_per_note() {
        let mut index = SemanticIndex::new("model", "v1");
        index.chunks = vec![
            chunk("/vault/a.md", "Apollo", vec![0.1, 0.9], "weak chunk"),
            chunk("/vault/a.md", "Apollo", vec![1.0, 0.0], "strong chunk"),
            chunk("/vault/b.md", "Baking", vec![0.8, 0.2], "other chunk"),
        ];

        let response = query_index(&index, &[1.0, 0.0], "apollo", 10, 12);

        assert_eq!(response.elapsed_ms, 12);
        assert_eq!(response.results.len(), 2);
        assert_eq!(response.results[0].snippet, "strong chunk");
    }
}
```

- [ ] **Step 2: Export module and run failing tests**

In `src-tauri/src/semantic/mod.rs`, add:

```rust
pub mod query;
```

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::query
```

Expected: FAIL because `query_index` is not implemented.

- [ ] **Step 3: Implement query aggregation**

Add to `query.rs`:

```rust
use std::collections::HashMap;

pub fn query_index(
    index: &SemanticIndex,
    query_embedding: &[f32],
    query: &str,
    limit: usize,
    elapsed_ms: u64,
) -> SearchResponse {
    let mut best_by_note: HashMap<&str, (&ChunkRecord, f64)> = HashMap::new();

    for chunk in &index.chunks {
        let score = cosine_similarity(query_embedding, &chunk.embedding);
        best_by_note
            .entry(&chunk.note_path)
            .and_modify(|current| {
                if score > current.1 {
                    *current = (chunk, score);
                }
            })
            .or_insert((chunk, score));
    }

    let mut results = best_by_note
        .into_values()
        .map(|(chunk, score)| SearchResult {
            title: chunk.title.clone(),
            path: chunk.note_path.clone(),
            snippet: chunk.text.chars().take(220).collect(),
            score,
            note_type: chunk.note_type.clone(),
        })
        .collect::<Vec<_>>();

    results.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit);

    SearchResponse {
        results,
        elapsed_ms,
        query: query.to_string(),
        mode: "semantic".to_string(),
    }
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f64 {
    if a.is_empty() || a.len() != b.len() {
        return 0.0;
    }

    let mut dot = 0.0_f64;
    let mut norm_a = 0.0_f64;
    let mut norm_b = 0.0_f64;

    for (left, right) in a.iter().zip(b.iter()) {
        let left = *left as f64;
        let right = *right as f64;
        dot += left * right;
        norm_a += left * left;
        norm_b += right * right;
    }

    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }

    dot / (norm_a.sqrt() * norm_b.sqrt())
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::query
```

Expected: PASS.

Run CodeScene on `src-tauri/src/semantic/query.rs` and `src-tauri/src/semantic/mod.rs`.

Commit:

```bash
git add src-tauri/src/semantic/query.rs src-tauri/src/semantic/mod.rs
git commit -m "Rank semantic search chunks by note"
```

## Task 6: FastEmbed Wrapper Behind A Testable Trait

**Files:**
- Create: `src-tauri/src/semantic/embedder.rs`
- Modify: `src-tauri/src/semantic/mod.rs`
- Modify: `src-tauri/Cargo.toml`
- Test: `src-tauri/src/semantic/embedder.rs`

- [ ] **Step 1: Add embedder trait and fake tests**

Create `src-tauri/src/semantic/embedder.rs`:

```rust
pub trait SemanticEmbedder {
    fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String>;
    fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String>;
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeEmbedder;

    impl SemanticEmbedder for FakeEmbedder {
        fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
            Ok(passages.into_iter().map(|text| vec![text.len() as f32, 1.0]).collect())
        }

        fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
            Ok(vec![query.len() as f32, 1.0])
        }
    }

    #[test]
    fn fake_embedder_returns_one_vector_per_passage() {
        let mut embedder = FakeEmbedder;

        let vectors = embedder
            .embed_passages(vec!["short".into(), "longer".into()])
            .unwrap();

        assert_eq!(vectors, vec![vec![5.0, 1.0], vec![6.0, 1.0]]);
    }
}
```

- [ ] **Step 2: Export module and run trait tests**

In `src-tauri/src/semantic/mod.rs`, add:

```rust
pub mod embedder;
```

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::embedder
```

Expected: PASS for the fake trait test.

- [ ] **Step 3: Add FastEmbed dependency and wrapper**

In `src-tauri/Cargo.toml`, add:

```toml
fastembed = "5"
```

Add to `embedder.rs`:

```rust
pub struct FastEmbedder {
    model: fastembed::TextEmbedding,
}

impl FastEmbedder {
    pub fn new() -> Result<Self, String> {
        let model = fastembed::TextEmbedding::try_new(
            fastembed::InitOptions::new(fastembed::EmbeddingModel::AllMiniLML6V2)
                .with_show_download_progress(false),
        )
        .map_err(|e| format!("Failed to initialize semantic embedding model: {e}"))?;

        Ok(Self { model })
    }
}

impl SemanticEmbedder for FastEmbedder {
    fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
        let prefixed = passages
            .into_iter()
            .map(|text| format!("passage: {text}"))
            .collect::<Vec<_>>();
        self.model
            .embed(prefixed, None)
            .map_err(|e| format!("Failed to embed passages: {e}"))
    }

    fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
        self.model
            .embed(vec![format!("query: {query}")], None)
            .map_err(|e| format!("Failed to embed query: {e}"))?
            .into_iter()
            .next()
            .ok_or_else(|| "Embedding model returned no query vector".to_string())
    }
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::embedder
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

Run CodeScene on `src-tauri/src/semantic/embedder.rs`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.

Commit:

```bash
git add src-tauri/src/semantic/embedder.rs src-tauri/src/semantic/mod.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Wrap local semantic embedding model"
```

## Task 7: Semantic Commands

**Files:**
- Create: `src-tauri/src/commands/semantic.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/semantic/mod.rs`
- Test: `src-tauri/src/commands/semantic.rs`

- [ ] **Step 1: Add command module skeleton and failing tests**

Create `src-tauri/src/commands/semantic.rs`:

```rust
use crate::search::SearchResponse;
use crate::semantic::{SemanticStatus, SemanticStatusStore};

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
    _vault_path: String,
    _query: String,
    _limit: usize,
) -> Result<SearchResponse, String> {
    Err("semantic search is not implemented".to_string())
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
```

- [ ] **Step 2: Export and register commands**

In `src-tauri/src/commands/mod.rs`, add:

```rust
mod semantic;
pub use semantic::*;
```

In `src-tauri/src/lib.rs`, add these to `app_invoke_handler!` near `commands::search_vault`:

```rust
commands::semantic_index_status,
commands::rebuild_semantic_index,
commands::search_vault_semantic,
```

- [ ] **Step 3: Run tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::semantic
```

Expected: PASS for the status shell; rebuild/search intentionally return errors until Task 8.

- [ ] **Step 4: Commit command shell**

Run CodeScene on touched files.

Commit:

```bash
git add src-tauri/src/commands/semantic.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "Expose semantic search command surface"
```

## Task 8: Build And Query The Semantic Index

**Files:**
- Modify: `src-tauri/src/semantic/index.rs`
- Modify: `src-tauri/src/semantic/mod.rs`
- Modify: `src-tauri/src/commands/semantic.rs`
- Test: `src-tauri/src/commands/semantic.rs`

- [ ] **Step 1: Add command-level fixture test**

In `src-tauri/src/commands/semantic.rs`, add this test with a fake embedder:

```rust
#[cfg(test)]
mod command_search_tests {
    use super::*;
    use crate::semantic::embedder::SemanticEmbedder;
    use std::fs;

    struct KeywordFakeEmbedder;

    impl SemanticEmbedder for KeywordFakeEmbedder {
        fn embed_passages(&mut self, passages: Vec<String>) -> Result<Vec<Vec<f32>>, String> {
            Ok(passages
                .into_iter()
                .map(|text| {
                    if text.contains("Shau") {
                        vec![1.0, 0.0]
                    } else {
                        vec![0.0, 1.0]
                    }
                })
                .collect())
        }

        fn embed_query(&mut self, query: &str) -> Result<Vec<f32>, String> {
            if query.contains("Shau") {
                Ok(vec![1.0, 0.0])
            } else {
                Ok(vec![0.0, 1.0])
            }
        }
    }

    #[test]
    fn semantic_fixture_finds_frontmatter_author() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path();
        fs::write(
            vault.join("apollo.md"),
            "---\nauthor: Shau\ntype: Project\n---\n# Apollo\n\nMoon mission",
        )
        .unwrap();
        fs::write(
            vault.join("bread.md"),
            "---\nauthor: Mina\ntype: Recipe\n---\n# Bread\n\nSourdough",
        )
        .unwrap();
        let mut embedder = KeywordFakeEmbedder;

        let response = build_and_query_with_embedder(
            vault.to_str().unwrap(),
            "notes by Shau",
            10,
            &mut embedder,
        )
        .unwrap();

        assert_eq!(response.results[0].title, "Apollo");
        assert!(response.results[0].snippet.contains("author: Shau"));
    }
}
```

- [ ] **Step 2: Run failing fixture test**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::semantic::command_search_tests::semantic_fixture_finds_frontmatter_author
```

Expected: FAIL because `build_and_query_with_embedder` is missing.

- [ ] **Step 3: Implement Markdown scan to semantic index**

Add a public helper in `commands/semantic.rs`:

```rust
pub fn build_and_query_with_embedder(
    vault_path: &str,
    query: &str,
    limit: usize,
    embedder: &mut dyn crate::semantic::embedder::SemanticEmbedder,
) -> Result<SearchResponse, String> {
    let started = std::time::Instant::now();
    let mut index = crate::semantic::index::SemanticIndex::new("test-model", "test-version");
    let vault = std::path::Path::new(vault_path);

    for entry in walkdir::WalkDir::new(vault)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.into_path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "md"))
    {
        let parsed = crate::vault::parse_md_file(&entry, None)?;
        let content = std::fs::read_to_string(&entry)
            .map_err(|e| format!("Failed to read {}: {e}", entry.display()))?;
        let mut properties = std::collections::HashMap::new();
        for (key, value) in parsed.properties {
            properties.insert(key, value.to_string());
        }
        let input = crate::semantic::chunker::SemanticNoteInput {
            path: parsed.path.clone(),
            title: parsed.title.clone(),
            note_type: parsed.is_a.clone(),
            aliases: parsed.aliases.clone(),
            properties,
            relationships: parsed.relationships.clone(),
            outgoing_links: parsed.outgoing_links.clone(),
            content,
        };
        let chunks = crate::semantic::chunker::chunk_note(&input, 512);
        let texts = chunks.iter().map(|chunk| chunk.text.clone()).collect::<Vec<_>>();
        let embeddings = embedder.embed_passages(texts)?;
        let records = chunks
            .into_iter()
            .zip(embeddings)
            .map(|(chunk, embedding)| crate::semantic::index::ChunkRecord {
                chunk_id: format!("{}#{}", chunk.note_path, chunk.chunk_index),
                note_path: chunk.note_path,
                title: parsed.title.clone(),
                note_type: parsed.is_a.clone(),
                aliases: parsed.aliases.clone(),
                properties: input.properties.clone(),
                relationships: parsed.relationships.clone(),
                outgoing_links: parsed.outgoing_links.clone(),
                text_hash: "runtime-hash".to_string(),
                text: chunk.text,
                embedding,
            })
            .collect::<Vec<_>>();
        index.upsert_note(&parsed.path, "runtime-note-hash", records);
    }

    let query_embedding = embedder.embed_query(query)?;
    Ok(crate::semantic::query::query_index(
        &index,
        &query_embedding,
        query,
        limit,
        started.elapsed().as_millis() as u64,
    ))
}
```

- [ ] **Step 4: Wire real command path**

Replace the `search_vault_semantic` body:

```rust
#[tauri::command]
pub async fn search_vault_semantic(
    vault_path: String,
    query: String,
    limit: usize,
) -> Result<SearchResponse, String> {
    tokio::task::spawn_blocking(move || {
        let mut embedder = crate::semantic::embedder::FastEmbedder::new()?;
        build_and_query_with_embedder(&vault_path, &query, limit, &mut embedder)
    })
    .await
    .map_err(|e| format!("Semantic search task failed: {e}"))?
}
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml commands::semantic::command_search_tests::semantic_fixture_finds_frontmatter_author
cargo test --manifest-path src-tauri/Cargo.toml semantic::
```

Expected: PASS.

Run CodeScene on touched files.

Commit:

```bash
git add src-tauri/src/commands/semantic.rs src-tauri/src/semantic src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "Search Markdown notes semantically"
```

## Task 9: Frontend Command Wrapper And Mode Toggle

**Files:**
- Create: `src/hooks/useSemanticSearchSettings.ts`
- Create: `src/components/SearchModeToggle.tsx`
- Create: `src/components/SearchModeToggle.test.tsx`
- Modify: `src/types.ts`
- Modify: `src/mock-tauri/mock-handlers.ts`

- [ ] **Step 1: Add mode toggle test**

Create `src/components/SearchModeToggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SearchModeToggle } from './SearchModeToggle'

describe('SearchModeToggle', () => {
  it('calls onChange when semantic mode is enabled', async () => {
    const onChange = vi.fn()
    render(<SearchModeToggle value="keyword" semanticEnabled={true} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Semantic search' }))

    expect(onChange).toHaveBeenCalledWith('semantic')
  })

  it('calls onEnableRequest when semantic mode is disabled', async () => {
    const onEnableRequest = vi.fn()
    render(
      <SearchModeToggle
        value="keyword"
        semanticEnabled={false}
        onChange={vi.fn()}
        onEnableRequest={onEnableRequest}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Semantic search disabled' }))

    expect(onEnableRequest).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm exec vitest run src/components/SearchModeToggle.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement mode toggle**

Create `src/components/SearchModeToggle.tsx`:

```tsx
import type { SearchMode } from '../types'
import { Button } from './ui/button'

interface SearchModeToggleProps {
  value: SearchMode
  semanticEnabled: boolean
  onChange: (mode: SearchMode) => void
  onEnableRequest?: () => void
}

export function SearchModeToggle({
  value,
  semanticEnabled,
  onChange,
  onEnableRequest,
}: SearchModeToggleProps) {
  const selectSemantic = () => {
    if (!semanticEnabled) {
      onEnableRequest?.()
      return
    }
    onChange('semantic')
  }

  return (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-muted p-0.5" aria-label="Search mode">
      <Button
        type="button"
        variant={value === 'keyword' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={() => onChange('keyword')}
        aria-pressed={value === 'keyword'}
      >
        Aa
      </Button>
      <Button
        type="button"
        variant={value === 'semantic' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 px-2 text-[11px]"
        onClick={selectSemantic}
        aria-pressed={value === 'semantic'}
        aria-label={semanticEnabled ? 'Semantic search' : 'Semantic search disabled'}
        title={semanticEnabled ? 'Semantic search' : 'Enable semantic search in Settings'}
      >
        ✦
      </Button>
    </div>
  )
}
```

In `src/types.ts`, narrow modes to implemented modes:

```ts
export type SearchMode = 'keyword' | 'semantic'
```

- [ ] **Step 4: Add command wrapper hook**

Create `src/hooks/useSemanticSearchSettings.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'

export interface SemanticStatus {
  enabled: boolean
  modelReady: boolean
  indexState: 'disabled' | 'not_ready' | 'indexing' | 'ready' | 'failed'
  indexedNotes: number
  totalNotes: number
  message: string | null
}

interface SemanticStatusData {
  enabled: boolean
  model_ready: boolean
  index_state: SemanticStatus['indexState']
  indexed_notes: number
  total_notes: number
  message: string | null
}

function semanticCall<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  return isTauri() ? invoke<T>(command, args) : mockInvoke<T>(command, args)
}

function mapStatus(status: SemanticStatusData): SemanticStatus {
  return {
    enabled: status.enabled,
    modelReady: status.model_ready,
    indexState: status.index_state,
    indexedNotes: status.indexed_notes,
    totalNotes: status.total_notes,
    message: status.message,
  }
}

export function useSemanticSearchSettings(active: boolean) {
  const [status, setStatus] = useState<SemanticStatus | null>(null)

  const refresh = useCallback(async () => {
    const next = await semanticCall<SemanticStatusData>('semantic_index_status')
    setStatus(mapStatus(next))
  }, [])

  useEffect(() => {
    if (!active) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 1500)
    return () => window.clearInterval(timer)
  }, [active, refresh])

  const rebuild = useCallback(async (vaultPath: string) => {
    const next = await semanticCall<SemanticStatusData>('rebuild_semantic_index', { vaultPath })
    setStatus(mapStatus(next))
  }, [])

  return { status, refresh, rebuild }
}
```

- [ ] **Step 5: Add mocks**

In `src/mock-tauri/mock-handlers.ts`, add handlers:

```ts
semantic_index_status: () => ({
  enabled: false,
  model_ready: false,
  index_state: 'disabled',
  indexed_notes: 0,
  total_notes: 0,
  message: null,
}),
rebuild_semantic_index: () => ({
  enabled: true,
  model_ready: true,
  index_state: 'ready',
  indexed_notes: 0,
  total_notes: 0,
  message: null,
}),
search_vault_semantic: () => ({
  results: [],
  elapsed_ms: 0,
  query: '',
  mode: 'semantic',
}),
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
pnpm exec vitest run src/components/SearchModeToggle.test.tsx
```

Expected: PASS.

Run CodeScene on touched files.

Commit:

```bash
git add src/hooks/useSemanticSearchSettings.ts src/components/SearchModeToggle.tsx src/components/SearchModeToggle.test.tsx src/types.ts src/mock-tauri/mock-handlers.ts
git commit -m "Add semantic search frontend controls"
```

## Task 10: SearchPanel Semantic Mode

**Files:**
- Modify: `src/hooks/useUnifiedSearch.ts`
- Modify: `src/components/SearchPanel.tsx`
- Test: `src/components/SearchPanel.test.tsx`

- [ ] **Step 1: Add SearchPanel test for semantic command**

In `src/components/SearchPanel.test.tsx`, add:

```tsx
it('uses semantic search command when semantic mode is selected and enabled', async () => {
  const user = userEvent.setup()
  renderSearchPanel({ open: true })

  await user.click(screen.getByRole('button', { name: 'Semantic search' }))
  await user.type(screen.getByPlaceholderText('Search in all notes...'), 'notes by Shau')

  await waitFor(() => {
    expect(mockInvokeFn).toHaveBeenCalledWith('search_vault_semantic', {
      vaultPath: '/vault',
      query: 'notes by Shau',
      limit: 20,
    })
  })
})
```

Set the semantic status mock in that test to enabled/ready:

```ts
mockInvokeFn.mockImplementation((command) => {
  if (command === 'semantic_index_status') {
    return Promise.resolve({
      enabled: true,
      model_ready: true,
      index_state: 'ready',
      indexed_notes: 2,
      total_notes: 2,
      message: null,
    })
  }
  if (command === 'search_vault_semantic') {
    return Promise.resolve({ results: [], elapsed_ms: 1, query: 'notes by Shau', mode: 'semantic' })
  }
  return Promise.resolve({ results: [], elapsed_ms: 1, query: '', mode: 'keyword' })
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm exec vitest run src/components/SearchPanel.test.tsx
```

Expected: FAIL because SearchPanel has no semantic toggle and `useUnifiedSearch` always calls `search_vault`.

- [ ] **Step 3: Update `useUnifiedSearch`**

Change `useUnifiedSearch` signature:

```ts
export function useUnifiedSearch(vaultPath: string, active: boolean, mode: SearchMode = 'keyword') {
```

Change `searchCall`:

```ts
function searchCall(mode: SearchMode, args: Record<string, unknown>): Promise<SearchResponseData> {
  const command = mode === 'semantic' ? 'search_vault_semantic' : 'search_vault'
  return isTauri()
    ? invoke<SearchResponseData>(command, args)
    : mockInvoke<SearchResponseData>(command, args)
}
```

Change invocation:

```ts
const response = await searchCall(mode, { vaultPath, query: q, mode, limit: 20 })
```

For semantic command compatibility, remove `mode` before call if tests expect only `vaultPath`, `query`, `limit`:

```ts
const args = mode === 'semantic'
  ? { vaultPath, query: q, limit: 20 }
  : { vaultPath, query: q, mode, limit: 20 }
const response = await searchCall(mode, args)
```

Add `mode` to the `performSearch` dependency list.

- [ ] **Step 4: Update SearchPanel**

In `SearchPanel.tsx`, import:

```ts
import { useState } from 'react'
import { SearchModeToggle } from './SearchModeToggle'
import { useSemanticSearchSettings } from '../hooks/useSemanticSearchSettings'
import type { SearchMode } from '../types'
```

Add state:

```ts
const [mode, setMode] = useState<SearchMode>('keyword')
const { status: semanticStatus } = useSemanticSearchSettings(open)
const semanticEnabled = semanticStatus?.enabled === true && semanticStatus.indexState === 'ready'
```

Pass mode:

```ts
} = useUnifiedSearch(vaultPath, open, mode)
```

Render `SearchModeToggle` inside `SearchInput` by extending props:

```tsx
<SearchInput
  ref={inputRef}
  query={query}
  loading={loading}
  mode={mode}
  semanticEnabled={semanticEnabled}
  onModeChange={setMode}
  onEnableSemanticRequest={() => setMode('keyword')}
  onChange={setQuery}
  onKeyDown={handleKeyDown}
/>
```

Inside `SearchInput`, render before the spinner:

```tsx
<SearchModeToggle
  value={mode}
  semanticEnabled={semanticEnabled}
  onChange={onModeChange}
  onEnableRequest={onEnableSemanticRequest}
/>
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm exec vitest run src/components/SearchPanel.test.tsx src/components/SearchModeToggle.test.tsx
```

Expected: PASS.

Run CodeScene on touched files.

Commit:

```bash
git add src/hooks/useUnifiedSearch.ts src/components/SearchPanel.tsx src/components/SearchPanel.test.tsx
git commit -m "Route search panel semantic queries"
```

## Task 11: Settings Search Section

**Files:**
- Modify: `src/components/SettingsPanel.tsx`
- Modify: `src/components/SettingsPanel.test.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Add SettingsPanel test**

In `src/components/SettingsPanel.test.tsx`, add:

```tsx
it('saves semantic search enablement from the Search section', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  render(<SettingsPanel open settings={baseSettings} onSave={onSave} onClose={vi.fn()} />)

  await user.click(screen.getByRole('switch', { name: 'Enable semantic search' }))
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    semantic_search_enabled: true,
  }))
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
pnpm exec vitest run src/components/SettingsPanel.test.tsx
```

Expected: FAIL because SettingsPanel has no Search section or semantic draft state.

- [ ] **Step 3: Add draft field**

Add to `SettingsDraft`:

```ts
semanticSearchEnabled: boolean
```

Add to `createSettingsDraft`:

```ts
semanticSearchEnabled: settings.semantic_search_enabled ?? false,
```

Add to `buildSettingsFromDraft`:

```ts
semantic_search_enabled: draft.semanticSearchEnabled,
```

Add props to `SettingsBodyProps`:

```ts
semanticSearchEnabled: boolean
setSemanticSearchEnabled: (value: boolean) => void
```

Pass those props from `SettingsPanelInner` to `SettingsBody`.

- [ ] **Step 4: Add Search section component**

In `SettingsPanel.tsx`, add:

```tsx
function SearchSettingsSection({
  t,
  semanticSearchEnabled,
  setSemanticSearchEnabled,
}: Pick<SettingsBodyProps, 't' | 'semanticSearchEnabled' | 'setSemanticSearchEnabled'>) {
  return (
    <>
      <SectionHeading
        title="Search"
        description="Semantic search uses a local model and only indexes after you enable it."
      />
      <SwitchRow
        label="Enable semantic search"
        description="Downloads a local embedding model, then indexes Markdown notes on this device."
        checked={semanticSearchEnabled}
        onCheckedChange={setSemanticSearchEnabled}
      />
      <p className="mt-2 text-[11px] text-muted-foreground">
        Note text and search queries are not sent to a semantic search service.
      </p>
    </>
  )
}
```

If `SwitchRow` does not exist, create it near other settings controls:

```tsx
function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}
```

Render the section before Privacy:

```tsx
<SettingsSection>
  <SearchSettingsSection
    t={t}
    semanticSearchEnabled={semanticSearchEnabled}
    setSemanticSearchEnabled={setSemanticSearchEnabled}
  />
</SettingsSection>
```

- [ ] **Step 5: Run tests and commit**

Run:

```bash
pnpm exec vitest run src/components/SettingsPanel.test.tsx
```

Expected: PASS.

Run CodeScene on touched files.

Commit:

```bash
git add src/components/SettingsPanel.tsx src/components/SettingsPanel.test.tsx src/types.ts
git commit -m "Add semantic search settings"
```

## Task 12: Index Persistence Outside Vault

**Files:**
- Modify: `src-tauri/src/semantic/index.rs`
- Modify: `src-tauri/src/semantic/model.rs`
- Test: `src-tauri/src/semantic/index.rs`

- [ ] **Step 1: Add cache path test**

In `src-tauri/src/semantic/index.rs`, add:

```rust
#[test]
fn semantic_cache_path_is_outside_vault() {
    let cache_root = PathBuf::from("/tmp/laputa-cache");
    let vault = PathBuf::from("/Users/me/Vault");

    let path = semantic_index_path(&cache_root, &vault);

    assert!(path.starts_with("/tmp/laputa-cache"));
    assert!(path.ends_with("semantic/index.bin"));
    assert!(!path.starts_with(&vault));
}
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::index::tests::semantic_cache_path_is_outside_vault
```

Expected: FAIL because `semantic_index_path` does not exist.

- [ ] **Step 3: Implement path hashing**

Add to `index.rs`:

```rust
use std::hash::{Hash, Hasher};

pub fn semantic_index_path(cache_root: &Path, vault_path: &Path) -> PathBuf {
    cache_root
        .join(vault_path_hash(vault_path))
        .join("semantic")
        .join("index.bin")
}

fn vault_path_hash(vault: &Path) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    vault.to_string_lossy().as_ref().hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::index
```

Expected: PASS.

Run CodeScene on touched files.

Commit:

```bash
git add src-tauri/src/semantic/index.rs src-tauri/src/semantic/model.rs
git commit -m "Store semantic index outside vault"
```

## Task 13: ADR And Docs

**Files:**
- Create: `docs/adr/0098-local-semantic-search.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ABSTRACTIONS.md`

- [ ] **Step 1: Write ADR**

Create `docs/adr/0098-local-semantic-search.md`:

```markdown
---
type: ADR
id: "0098"
title: "Opt-in local semantic search"
status: active
date: 2026-05-01
supersedes: "0009"
---

## Context

Tolaria's keyword search is reliable and cheap, but it cannot answer natural-language intent such as "notes by Shau" when the matching evidence is frontmatter. ADR-0009 removed QMD semantic indexing because a separate Go binary created packaging, signing, startup, and maintenance cost.

## Decision

Tolaria adds opt-in local semantic search as a native Rust/Tauri feature. Keyword search remains the default. Semantic search is enabled explicitly in Settings, downloads and verifies a local embedding model, indexes Markdown notes outside the vault, and exposes semantic results through the existing search UI.

Semantic implementation lives behind `src-tauri/src/semantic/` so future upstream merges avoid unnecessary conflicts in core vault and search modules.

## Consequences

- No note text or query text is sent to a semantic search service.
- First enable may require a model download.
- Semantic cache is disposable and stored under `~/.laputa/cache/`.
- Markdown notes are indexed in v1; graph traversal and visualization are deferred.
- Future graph features should build on semantic note metadata instead of adding unrelated state to app modules.
```

- [ ] **Step 2: Update architecture docs**

In `docs/ARCHITECTURE.md`, update the Search tech stack row from:

```markdown
| Search | Keyword (walkdir-based file scan) | - |
```

to:

```markdown
| Search | Keyword by default; opt-in local semantic search for Markdown notes | `walkdir`, `fastembed` |
```

Add one paragraph under "Three representations, one authority":

```markdown
Semantic search adds a fourth reconstructible cache under `~/.laputa/cache/<vault-hash>/semantic/`. It is not an authority: deleting it only forces a rebuild from Markdown files, frontmatter, and the local embedding model cache.
```

- [ ] **Step 3: Update abstractions docs**

In `docs/ABSTRACTIONS.md`, add a section after "Document Model":

```markdown
### Semantic Search Cache

Semantic search indexes Markdown notes only. Each indexed note is represented by chunks derived from the note body plus a metadata header built from title, type, aliases, and scalar frontmatter. Relationship keys and outgoing wikilinks are copied into index metadata for future graph features, but v1 search does not compute paths, centrality, or communities.

The cache is stored outside the vault and can be rebuilt from the filesystem at any time.
```

- [ ] **Step 4: Run docs checks and commit**

Run:

```bash
rg -n "semantic search|Semantic Search|0098" docs/ARCHITECTURE.md docs/ABSTRACTIONS.md docs/adr/0098-local-semantic-search.md
```

Expected: matches in all three docs.

Commit:

```bash
git add docs/adr/0098-local-semantic-search.md docs/ARCHITECTURE.md docs/ABSTRACTIONS.md
git commit -m "Document local semantic search architecture"
```

## Task 14: Smoke Test

**Files:**
- Create: `tests/smoke/semantic-search-frontmatter.spec.ts`

- [ ] **Step 1: Add Playwright smoke test**

Create `tests/smoke/semantic-search-frontmatter.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('semantic search finds frontmatter-backed author query', async ({ page }) => {
  await page.goto('/')

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+,' : 'Control+,')
  await page.getByRole('switch', { name: 'Enable semantic search' }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')
  await page.getByRole('button', { name: 'Semantic search' }).click()
  await page.getByPlaceholder('Search in all notes...').fill('notes by Shau')

  await expect(page.getByText(/Shau|Apollo/i)).toBeVisible({ timeout: 30_000 })
})
```

- [ ] **Step 2: Run smoke test**

Run:

```bash
pnpm dev --port 5201
```

In another shell:

```bash
BASE_URL="http://localhost:5201" npx playwright test tests/smoke/semantic-search-frontmatter.spec.ts
```

Expected: PASS. If the real model download makes this too slow or network-dependent, replace the test with a mocked Tauri semantic response and keep native model verification in Rust tests.

- [ ] **Step 3: Commit**

Run CodeScene on the new test file. Expected: no findings or score `10.0`.

Commit:

```bash
git add tests/smoke/semantic-search-frontmatter.spec.ts
git commit -m "Cover semantic search author flow"
```

## Task 15: Full Verification And Push

**Files:**
- Read: all touched files
- Modify only if verification finds defects

- [ ] **Step 1: Run targeted Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml semantic::
cargo test --manifest-path src-tauri/Cargo.toml commands::semantic
cargo test --manifest-path src-tauri/Cargo.toml settings::
```

Expected: PASS.

- [ ] **Step 2: Run targeted frontend tests**

Run:

```bash
pnpm exec vitest run src/components/SearchModeToggle.test.tsx src/components/SearchPanel.test.tsx src/components/SettingsPanel.test.tsx src/hooks/useSettings.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run standard checks**

Run:

```bash
pnpm lint
npx tsc --noEmit
pnpm test
pnpm test:coverage
cargo test --manifest-path src-tauri/Cargo.toml
cargo llvm-cov --manifest-path src-tauri/Cargo.toml --no-clean --fail-under-lines 85
```

Expected: PASS and coverage gates satisfied.

- [ ] **Step 4: Run smoke suite**

Run:

```bash
pnpm dev --port 5201
BASE_URL="http://localhost:5201" pnpm playwright:smoke
```

Expected: PASS under 5 minutes.

- [ ] **Step 5: Run native QA**

Run:

```bash
pnpm tauri dev
bash ~/.openclaw/skills/tolaria-qa/scripts/focus-app.sh laputa
bash ~/.openclaw/skills/tolaria-qa/scripts/screenshot.sh /tmp/qa-native-semantic-search.png
```

Expected: app launches, Settings/Search renders, search panel remains usable.

- [ ] **Step 6: Final CodeScene checks**

Run CodeScene file-level review on every touched or new code file. Expected: each touched file score improved from baseline, or remained `10.0`; each new scorable file is `10.0`; no findings on non-scorable new files.

Run project health score. Expected: Hotspot and Average remain at or above `.codescene-thresholds`.

- [ ] **Step 7: Push to main**

Run:

```bash
git status --short
git push origin main
```

Expected: push succeeds. If pre-push updates `.codescene-thresholds`, commit the ratchet update with a normal verified commit, then push again.

