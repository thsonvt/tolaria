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
