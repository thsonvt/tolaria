# Bundled-local semantic search — design

**Date:** 2026-04-29
**Status:** Validated design, awaiting implementation.
**Supersedes (in spirit):** ADR-0009 (keyword-only search). Implementation will create ADR-0080 to formalise the supersession.

---

## Context

Tolaria's note-list search is pure case-insensitive substring matching against title + raw file content (`src-tauri/src/search.rs:125`). A natural-language query like *"show me notes written by author Shau"* is matched as a single 39-character substring, so it returns nothing — even though the relevant notes carry `author: Shau` in their YAML frontmatter.

ADR-0009 deliberately removed the previous QMD-based semantic indexing in 2026-03 because of the operational cost of bundling and code-signing a separate Go binary. The user has confirmed they want true vector semantic search (option D in brainstorm). The modern Rust embedding ecosystem (`fastembed` + `ort` ONNX runtime) collapses the QMD-era pain into a single Cargo dependency, so the original objection mostly dissolves. This design ships semantic search **alongside** the existing keyword search, never replaces it.

**Outcome we want:** typing a natural-language question into the search bar (in semantic mode) finds the right notes, including matches grounded in frontmatter values like `author`, `type`, `status`.

**Non-goals for v1:** hybrid BM25+vector retrieval, cross-encoder reranking, conversational "ask your vault" UI, multi-vault search, user-selectable embedding models.

---

## Architecture

New Rust module mirroring the `vault/` / `git/` / `frontmatter/` split (ADR-0030):

```
src-tauri/src/semantic/
  mod.rs            — public API
  embedder.rs       — fastembed wrapper; loads ONNX model once
  chunker.rs        — splits a note into ≤512-token chunks at H2 boundaries
  index.rs          — vector store (Vec<ChunkRecord> in RAM, bincode on disk)
  query.rs          — embed query → cosine top-K → aggregate chunks → notes
```

- **Embedder:** `fastembed` crate with `all-MiniLM-L6-v2` quantized int8 (~25 MB, 384-dim). Pure Rust, ONNX-only.
- **Vector store:** brute-force cosine over `Vec<(chunk_id, [f32; 384])>`. Sub-millisecond on 10k-note vaults; HNSW (`instant-distance`) is a v2 upgrade once anyone hits 30k chunks.
- **No replacement of `search.rs`** — semantic is a new mode behind a UI toggle. Keyword fallback always available.

New Tauri commands registered in `src-tauri/src/lib.rs`:

| Command | Purpose |
|---|---|
| `search_vault_semantic(query, limit)` | Semantic top-K over the active vault |
| `rebuild_semantic_index()` | Force full re-embed (Settings button) |
| `semantic_index_status()` | Returns `{ ready, indexed, total, last_updated }` for UI |

---

## Indexing lifecycle

Three trigger points, all hooked to existing infrastructure:

1. **Vault open.** `vault/cache.rs::scan_vault_cached()` returns entries unchanged. Right after, `semantic::index::ensure_index()` runs in a background Tokio task: diffs `meta.json::note_hashes` against current entries, embeds only the deltas, persists `index.bin`. Status bar shows progress (reuses the existing reload-spinner pattern). **Editor and keyword search are unblocked the entire time.** This is the explicit fix for ADR-0009's startup-latency objection.
2. **Note save.** Existing post-save reactive path (ADR-0043, `useVaultLoader`) emits a saved-path signal. A 1s-debounced queue in `semantic::index` re-embeds dirty paths. Disk-first writes still apply: re-embed only after the markdown is durable.
3. **External change.** `vault_watcher.rs` already emits `vault-changed` for non-app-owned writes (ADR-0036). Same debounce queue consumes them. Renames remap path keys; deletes drop chunks.

### What gets embedded

Each note splits along H2 (`##`) boundaries into ≤512-token chunks. **The first chunk of every note is prefixed with a metadata header**:

```
Title: <h1> | Type: <type> | Author: <author> | Status: <status> | <other frontmatter>
```

This is the single change that solves the original "notes by author Shau" failure — frontmatter values become first-class semantic content.

### Storage

```
~/.laputa/cache/<vault-hash>/semantic/
  index.bin         — bincode of Vec<ChunkRecord { chunk_id, note_path, chunk_text_hash, embedding }>
  meta.json         — { model_id, model_version, vault_hash, last_indexed_at, note_hashes }
```

Cache outside the vault (ADR-0024). Disposable: `reload_vault` deletes it like any other cache. If `model_id` in `meta.json` ≠ the current build's bundled model id, the entire index is wiped and rebuilt.

### Model bundling

**Downloaded on first index build, not embedded in the binary.** Inflating the `.app` / AppImage / Windows installer with a 25 MB ONNX file plus the `ort` runtime would slow code-signing on every release. Instead the binary ships a tiny manifest (`model_id`, SHA-256, primary URL, mirror URL); `embedder.rs` downloads the model to `~/.laputa/cache/models/<model_id>.onnx`, verifies the hash, loads via `ort`. Cached file is shared across vaults. Offline on first run → semantic mode shows "Model not yet downloaded — retry"; keyword search is unaffected.

---

## Query UX

- **Mode toggle** in the search bar: `[Aa | ✦]` segmented control. `Aa` = Keyword (default, unchanged), `✦` = Semantic. Mode stored in app settings (per-installation, not per-vault).
- **Cmd-K** also exposes `Search → Semantic mode` for keyboard users (ADR-0020).
- **Query path.** `useNoteListFilter` calls `search_vault_semantic` instead of `search_vault` when in semantic mode. Result shape is identical to the keyword path → no frontend rendering changes.
- **Aggregation.** Max-pool chunk scores per note. Drop notes scoring below ~0.35 cosine for `all-MiniLM-L6-v2` (tunable). Top-30 returned.
- **Snippet** = the highest-scoring chunk's text. Frontmatter-prefixed first chunks naturally surface `Author: Shau | …` strings, so users see *why* a note matched.
- **Indexing-in-progress UX.** Semantic mode shows `"Indexing 412 / 1240 notes…"` and silently falls back to keyword for that session.
- **Privacy line** in Settings → Search: *"Semantic search runs entirely on your device. Queries are never sent over the network."*

---

## Failure modes & limits

| Failure | Behavior |
|---|---|
| Model not yet downloaded | Semantic toggle disabled, retry button in Settings; keyword unaffected |
| Model SHA-256 mismatch | Re-download; never load unverified bytes |
| `index.bin` corrupt | Sentry breadcrumb, delete index + meta, full rebuild on next vault open |
| Note >1 MB | Skip from indexing (hard cap; prevents chunker pathological cases) |
| Vault chunk count >30k | Sentry breadcrumb (signal to ship HNSW v2); functional but slower |
| Network missing on first run | Semantic disabled until next attempt; keyword unaffected |

**Telemetry.** PostHog event `semantic_index_built` with `{ note_count, chunk_count, duration_ms }`. **Query strings are never sent**, only `semantic_query_executed` with `{ result_count, latency_ms }`.

---

## Critical files to create / modify

**New:**
- `src-tauri/src/semantic/mod.rs`, `embedder.rs`, `chunker.rs`, `index.rs`, `query.rs`
- `src-tauri/src/commands/semantic.rs` — Tauri command surface
- `src/hooks/useSemanticIndexStatus.ts` — UI polling for status bar / Settings
- `src/components/SearchModeToggle.tsx` — `[Aa | ✦]` segmented control (shadcn/ui `ToggleGroup`)
- `tests/smoke/semantic-search-finds-frontmatter-author.spec.ts` — `@smoke` Playwright
- `docs/adr/0080-bundled-local-semantic-search.md` — supersedes ADR-0009

**Modify:**
- `src-tauri/Cargo.toml` — add `fastembed`, `ort`, `bincode`, `instant-distance` (placeholder), `reqwest` (model download)
- `src-tauri/src/lib.rs` — register the 3 new commands; spawn `ensure_index()` after vault load
- `src-tauri/src/vault/cache.rs` — fire post-load hook for the indexer
- `src-tauri/src/vault_watcher.rs` — feed external-change paths into the debounce queue (reuse the existing event emitter; no new IPC)
- `src/hooks/useNoteListFilter.ts` — branch on mode, call the right Tauri command
- `src/components/SettingsPanel.tsx` — Search section: enable toggle, rebuild button, status line, privacy disclosure

**Reuse:**
- `vault::file::read_markdown_string()` — UTF-8 BOM / lossy decode handling
- `vault::derive_markdown_title_from_content()` — title extraction (already used in `search.rs`)
- The existing reload-spinner status-bar pattern for "indexing" UX
- `crate::hidden_command` infrastructure if `reqwest` ends up gated for the model download

---

## TDD plan (Red → Green → Refactor, one cycle per commit)

1. `chunker.rs` — H2 split + token cap + metadata prefix on chunk 0. Pure-function tests.
2. `embedder.rs` — load model, embed deterministic input, dim == 384.
3. `index.rs` — bincode round-trip; upsert by `note_path`; delete by `note_path`.
4. `query.rs` — cosine top-K; per-note max-pool aggregation.
5. `commands/semantic.rs` — fixture vault with `author: Shau` frontmatter; query "notes by Shau" returns that note as top hit.
6. Frontend: Vitest for `SearchModeToggle`; Playwright smoke spec.

CodeScene gate: each new file targets 10.0. The 5-file split deliberately keeps per-file cyclomatic complexity low — pre-emptive move against the hotspot ratchet (ADR-0064).

---

## Rollout

1. Land behind PostHog feature flag `semantic_search_v1` (ADR-0042 already supports per-cohort flags).
2. Alpha channel first (ADR-0057). One-week observation window: Sentry regression count, index-build duration percentiles.
3. Promote to stable. Settings ships with semantic **disabled by default**; first-time enable triggers model download.
4. Remove `semantic_search_v1` flag once stable for two release cycles.

---

## Verification

End-to-end manual + automated proof that the original failure is fixed:

```bash
# 1. Native dev with the demo vault (which contains author-tagged notes)
pnpm tauri dev &
sleep 10

# 2. Wait for "Semantic index ready" in status bar (≤30s for demo-vault-v2)

# 3. Toggle search to ✦ semantic mode, type the original failing query:
#    "show me notes written by author Shau"
#    Expect: notes with `author: Shau` in frontmatter ranked at the top,
#            snippet showing "... | Author: Shau | ..."

# 4. Smoke test
pnpm dev --port 5201 &
BASE_URL="http://localhost:5201" \
  npx playwright test tests/smoke/semantic-search-finds-frontmatter-author.spec.ts

# 5. Rust tests + coverage
cargo test --manifest-path src-tauri/Cargo.toml semantic::
cargo llvm-cov --manifest-path src-tauri/Cargo.toml --no-clean --fail-under-lines 85

# 6. Frontend tests + coverage
pnpm exec vitest run src/components/SearchModeToggle.test.tsx
pnpm test:coverage  # ≥70%

# 7. CodeScene file-level review on every touched file (must remain ≥ baseline; new files == 10.0)
```

Acceptance:

- ✓ Original failing query returns the right notes
- ✓ All file-level CodeScene scores at or above baseline; new files at 10.0
- ✓ Hotspot + Average gates in `.codescene-thresholds` not regressed
- ✓ Keyword search still works identically when toggle is in `Aa` mode
- ✓ Semantic mode degrades cleanly when the model file is absent
- ✓ Sentry: zero new errors during alpha observation window
