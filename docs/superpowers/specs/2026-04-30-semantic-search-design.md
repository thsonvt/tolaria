# Semantic Search Design

Date: 2026-04-30
Status: Approved design, awaiting implementation plan

## Goal

Add native semantic search to Tolaria as the first step toward richer knowledge graph features inspired by `obra/knowledge-graph`, while keeping the fork maintainable against frequent upstream updates.

The first release optimizes for natural-language search in the existing note-list search surface. It does not add graph visualization, pathfinding, centrality, communities, or MCP graph tools yet. It does shape the semantic cache so those features can build on stable note and relationship metadata later.

## Decisions

- Build the feature natively in the Tauri/Rust backend.
- Keep most new behavior isolated under `src-tauri/src/semantic/`.
- Use local-only embeddings.
- Require explicit user enablement before model download or indexing.
- Index Markdown notes only for v1.
- Persist minimal graph metadata with the semantic index, but do not implement graph algorithms yet.
- Keep keyword search as the default and unchanged fallback.

## Architecture

Add a new backend subsystem:

```text
src-tauri/src/semantic/
  mod.rs       public API and shared types
  model.rs     local model manifest, cache, download, SHA-256 verification
  embedder.rs  embedding runtime wrapper
  chunker.rs   Markdown/frontmatter chunking
  index.rs     persistent index and update lifecycle
  query.rs     vector search, result aggregation, snippets
  status.rs    model/index readiness state
```

Existing Rust modules should only call small semantic entry points:

- `lib.rs` registers semantic Tauri commands.
- Vault open/reload calls semantic "maybe ensure index" only when enabled.
- Note save and watcher paths notify a semantic dirty-path queue only when enabled.
- `search.rs` remains keyword-only; semantic logic does not mix into it.

Frontend integration stays bounded:

- Settings/Search owns enablement, model status, retry, and rebuild controls.
- The note-list search UI adds a Keyword/Semantic mode control.
- Status surfaces report disabled, downloading, indexing, ready, stale, and failed states.
- Existing note-list rows render semantic results.

This boundary is the main upstream-compatibility strategy. New graph work should extend `semantic/` or a later dedicated graph module instead of spreading graph state through unrelated app modules.

## Data Model And Index

V1 indexes Markdown notes only. Each note is read from disk and parsed through the same Tolaria conventions used by the vault scanner: H1 title fallback, frontmatter properties, aliases, dynamic relationship fields, and outgoing wikilinks.

Each indexed note is split into chunks. The first chunk is prefixed with a semantic metadata header such as:

```text
Title: Example | Type: Project | Status: active | Author: Shau | ...
```

This makes scalar frontmatter searchable through natural-language queries, including queries like "notes by Shau".

Index records store:

- note path
- title, type, aliases
- scalar frontmatter included in search headers
- relationship keys and outgoing wikilinks for future graph hooks
- chunk text hash
- embedding vector
- model id and model version
- note content hash
- indexed timestamp

Semantic data lives outside the vault:

```text
~/.laputa/cache/<vault-hash>/semantic/
  index.bin
  meta.json

~/.laputa/cache/models/
  <model-id>.onnx
```

The cache is disposable and never committed to the vault. If the model id/version changes, the semantic index is invalidated and rebuilt.

## Indexing Lifecycle

Semantic search is off by default. Enabling it in Settings/Search starts the model download and then the initial index build.

When enabled:

- vault open/reload ensures the index exists and schedules stale notes
- note save schedules the changed Markdown path after disk write succeeds
- external watcher events schedule changed Markdown paths
- deletes remove note chunks from the index
- model changes invalidate and rebuild the index

Indexing runs in the background. Editor load, note editing, vault reload, and keyword search must not block on semantic indexing.

## Query UX

Settings/Search includes:

- "Enable semantic search" toggle
- model status: not downloaded, downloading, ready, failed
- index status: disabled, indexing N of M, ready, stale, failed
- actions: retry model download, rebuild semantic index
- privacy text explaining that semantic search runs locally, the first enable downloads the model, and note/query text is not sent to a service

The search UI includes a Keyword/Semantic segmented control:

- Keyword remains the default.
- Semantic mode is discoverable but disabled until enabled in Settings/Search.
- If semantic is enabled but indexing is not ready, the UI shows progress and falls back to keyword or a clear indexing state.
- Semantic results reuse existing note-list rows.
- Snippets come from the highest-scoring chunk, including metadata-header text when that explains the match.

## Error Handling

- Model download unavailable: keep semantic disabled; keyword remains available.
- SHA-256 mismatch: delete the bad model file and require retry.
- Corrupt index: delete semantic index and rebuild.
- Oversized or unreadable note: skip that note, record status, continue.
- Embedding runtime failure: report semantic unavailable; app remains usable.
- Model version mismatch: invalidate index and rebuild.

Errors must not corrupt vault files. Semantic cache rebuilds must be safe to interrupt and retry.

## Rollout

Semantic search ships off by default and requires explicit enablement. If the existing feature flag system can support it cleanly, gate the first rollout with a feature flag and enable it on the alpha channel first.

Telemetry may record:

- index build duration
- indexed note count
- chunk count
- query latency
- result count

Telemetry must not record query strings, note text, chunk text, or frontmatter values.

## Testing

Implementation should follow red/green/refactor cycles:

1. Chunker tests for metadata headers, H2 splitting, and size caps.
2. Model tests for manifest parsing and hash verification.
3. Index tests for upsert, delete, persistence, stale detection, and corrupt-index recovery.
4. Query tests for cosine search, per-note aggregation, and snippet selection.
5. Command tests using a fixture note with frontmatter such as `author: Shau`.
6. Frontend tests for Settings/Search controls and search-mode behavior.
7. Playwright smoke test for semantic search finding frontmatter-backed notes.

Verification must prove:

- keyword search behavior remains unchanged
- semantic search is unavailable until explicitly enabled
- model download failure leaves the app usable
- the original natural-language frontmatter query succeeds after indexing
- semantic cache files stay outside the vault
- touched files satisfy CodeScene file-level score requirements

## Non-Goals For V1

- graph visualization
- pathfinding between notes
- centrality or community detection
- MCP graph tools
- non-Markdown file indexing
- cloud/API embedding providers
- replacing keyword search
- user-selectable embedding models

