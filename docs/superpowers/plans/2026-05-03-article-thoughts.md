# Article Thoughts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build personal article thoughts/comments that can attach to selected text or a whole note, persist in `.tolaria/thoughts/` sidecars, and appear in a searchable sidebar collection.

**Architecture:** Thoughts are user-authored sidecar records, not Markdown mutations. Rust owns vault-bounded sidecar file IO, while TypeScript owns validation, grouping, filtering, anchor matching, and editor UI state. The UI mirrors the existing Highlights collection shape but adds create/edit/delete flows and subtle margin pins inside the BlockNote reader.

**Tech Stack:** React, TypeScript, Vitest, Tauri commands, Rust serde/filesystem helpers, BlockNote, shadcn/ui `Button`, `Input`, `Popover`, `Textarea`, Phosphor/Lucide icons, Playwright smoke tests.

---

## Source Spec

- `docs/superpowers/specs/2026-05-03-article-thoughts-design.md`

## Scope Check

The spec covers one cohesive subsystem: personal article thoughts. It has four implementation surfaces that can be delivered incrementally:

- Sidecar persistence commands.
- TypeScript thought model/index utilities.
- Sidebar Thoughts collection.
- Editor creation, pins, popovers, and jumps.

Do not split this into separate feature specs. Do split execution into task-sized commits as below.

## File Map

- Create `src-tauri/src/vault/thoughts.rs`: vault-side thought record structs, `.tolaria/thoughts/` path derivation, list/read/save/delete helpers, and Rust unit tests.
- Modify `src-tauri/src/vault/mod.rs`: export the new thought helpers.
- Create `src-tauri/src/commands/vault/thought_cmds.rs`: Tauri command wrappers for thought sidecars.
- Modify `src-tauri/src/commands/vault.rs`: re-export thought commands and add boundary tests.
- Modify `src-tauri/src/commands/vault/mod.rs`: register the new command module.
- Modify `src-tauri/src/lib.rs`: add thought commands to `app_invoke_handler!`.
- Create `src/utils/thoughts.ts`: frontend thought types, validation, grouping/filtering, anchor creation, anchor matching, jump event constants.
- Create `src/utils/thoughts.test.ts`: unit coverage for validation, grouping/filtering, sidecar-key expectations, and anchor matching.
- Create `src/hooks/useThoughtsIndex.ts`: lazy sidecar-backed index hook with create/update/delete actions.
- Create `src/hooks/useThoughtsIndex.test.tsx`: mocked Tauri hook coverage.
- Create `src/components/note-list/ThoughtsList.tsx`: grouped searchable Thoughts list.
- Create `src/components/note-list/ThoughtsList.test.tsx`: render/filter/click/error/empty tests.
- Modify `src/types.ts`: add `thoughts` to `SidebarFilter`.
- Modify `src/components/sidebar/SidebarTopNav.tsx`: add top-level Thoughts nav row and count.
- Modify `src/components/Sidebar.tsx`: pass `thoughtCount` to top nav.
- Modify `src/components/Sidebar.test.tsx`: cover Thoughts nav rendering and selection.
- Modify `src/components/note-list/useNoteListModel.tsx`: carry Thoughts list props through the model.
- Modify `src/components/note-list/NoteListLayout.tsx`: branch to `ThoughtsList`.
- Modify `src/components/note-list/noteListUtils.ts`: resolve `Thoughts` header title.
- Modify `src/utils/noteListHelpers.ts`: prevent regular notes from rendering for the `thoughts` filter.
- Create `src/components/thoughts/ThoughtPopover.tsx`: reusable popover for create/view/edit/delete.
- Create `src/components/thoughts/ThoughtPinsLayer.tsx`: margin-pin overlay for matched passage thoughts.
- Create `src/components/thoughts/ThoughtPinsLayer.test.tsx`: pin rendering and callback tests.
- Modify `src/components/tolariaEditorFormatting.tsx`: accept an optional add-thought toolbar item and render it when provided.
- Modify `src/components/tolariaEditorFormatting.behavior.test.tsx`: assert add-thought action appears and calls the handler.
- Modify `src/components/SingleEditorView.tsx`: selection capture, article-level thought creation, popover state, pin layer, and thought jump listener.
- Modify `src/components/Editor.tsx`, `src/components/EditorContent.tsx`, `src/components/editor-content/useEditorContentModel.ts`, and `src/components/editor-content/EditorContentLayout.tsx`: pass thought props through to `SingleEditorView`.
- Modify `src/App.tsx`: initialize `useThoughtsIndex`, wire sidebar/list/editor actions, open source notes, and dispatch thought jump events.
- Modify `src/App.css`: add margin pin, pulse, and popover orientation styles.
- Modify `src/mock-tauri/mock-handlers.ts`: add mock thought sidecar commands for unit and smoke tests.
- Modify `src/mock-tauri/index.ts`: no structural change expected; verify new commands flow through `mockHandlers`.
- Modify `src/lib/locales/en-US.json`: add Thoughts strings used by sidebar/list/toasts. Add matching keys to other locale JSON files with English fallback text if this repo requires every locale key to exist.
- Modify `docs/ARCHITECTURE.md` and `docs/ABSTRACTIONS.md`: document sidecar-backed Thoughts and the index hook.
- Create `tests/smoke/thoughts.spec.ts`: create, persist, list, filter, open, and delete a thought in a disposable vault.

## Commit Plan

- Commit 1: Rust sidecar persistence commands and tests.
- Commit 2: TypeScript thought utilities and index hook.
- Commit 3: Sidebar Thoughts collection and list view.
- Commit 4: Editor toolbar, popover, pins, jump handling, and styles.
- Commit 5: Smoke test and docs.

Use Lore-style commit messages per `AGENTS.md`. Do not use `--no-verify`.

## Task 0: Baseline And Guardrails

**Files:**
- Read: `.codescene-thresholds`
- Read: `docs/superpowers/specs/2026-05-03-article-thoughts-design.md`
- Read: `docs/ARCHITECTURE.md`
- Read: `docs/ABSTRACTIONS.md`
- Read: `docs/adr/`

- [ ] **Step 1: Confirm branch and dirty worktree**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
main
```

Also expect unrelated `.omx/` runtime state and `.superpowers/brainstorm/...` scratch files may be dirty. Do not stage or revert them.

- [ ] **Step 2: Read the approved spec**

Run:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-05-03-article-thoughts-design.md
```

Expected: the spec describes sidecar-backed Thoughts, margin pins, one editable thought per anchor for v1, whole-article thoughts, search by body/quote/title, and delete support.

- [ ] **Step 3: Read architecture docs**

Run:

```bash
sed -n '1,240p' docs/ARCHITECTURE.md
sed -n '1,240p' docs/ABSTRACTIONS.md
ls docs/adr
```

Expected: understand the existing Tauri command, sidebar, note-list, and editor boundaries before editing.

- [ ] **Step 4: Check CodeScene project health if the tool is available**

Run:

```bash
omx explore --prompt "Report the current CodeScene health gate status for /Users/sonle/Github/tolaria if available. If CodeScene is unavailable, say exactly unavailable."
```

Expected: either a health report at or above thresholds or `unavailable`. If unavailable, continue and run file-level checks before each commit.

## Task 1: Rust Thought Sidecar Persistence

**Files:**
- Create: `src-tauri/src/vault/thoughts.rs`
- Modify: `src-tauri/src/vault/mod.rs`
- Create: `src-tauri/src/commands/vault/thought_cmds.rs`
- Modify: `src-tauri/src/commands/vault/mod.rs`
- Modify: `src-tauri/src/commands/vault.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write failing Rust tests for sidecar helpers**

Create `src-tauri/src/vault/thoughts.rs` with the structs and tests first. Use this initial content:

```rust
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ThoughtAnchor {
    Selection {
        quote: String,
        prefix: String,
        suffix: String,
        start_offset: usize,
        end_offset: usize,
    },
    Article,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThoughtRecord {
    pub id: String,
    pub note_path: String,
    pub note_title: String,
    pub anchor: ThoughtAnchor,
    pub body_markdown: String,
    pub created_at: String,
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_thought(id: &str, body: &str) -> ThoughtRecord {
        ThoughtRecord {
            id: id.to_string(),
            note_path: "Articles/the-context-and-the-harness.md".to_string(),
            note_title: "The Context and the Harness".to_string(),
            anchor: ThoughtAnchor::Selection {
                quote: "Retrieved documents are where context engineering intersects".to_string(),
                prefix: "The trade-off with few-shot examples".to_string(),
                suffix: "formation retrieval".to_string(),
                start_offset: 120,
                end_offset: 181,
            },
            body_markdown: body.to_string(),
            created_at: "2026-05-03T08:00:00.000Z".to_string(),
            updated_at: "2026-05-03T08:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn thought_sidecar_path_uses_hex_note_path_inside_toleria_directory() {
        let root = Path::new("/vault");
        let path = thought_sidecar_path(root, "Articles/the-context-and-the-harness.md").unwrap();
        assert_eq!(
            path,
            root.join(".tolaria/thoughts/41727469636c65732f7468652d636f6e746578742d616e642d7468652d6861726e6573732e6d64.json"),
        );
    }

    #[test]
    fn save_read_and_delete_round_trip_one_note_thought_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let first = sample_thought("thought-1", "This is about retrieval quality.");
        let second = sample_thought("thought-2", "This belongs beside the same passage.");

        save_thought(dir.path(), first.clone()).unwrap();
        save_thought(dir.path(), second.clone()).unwrap();

        let thoughts = read_note_thoughts(dir.path(), &first.note_path).unwrap();
        assert_eq!(thoughts, vec![first.clone(), second.clone()]);

        delete_thought(dir.path(), &first.note_path, &first.id).unwrap();
        assert_eq!(read_note_thoughts(dir.path(), &first.note_path).unwrap(), vec![second]);
    }

    #[test]
    fn list_thoughts_ignores_malformed_json_but_reports_valid_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let thought = sample_thought("thought-1", "Valid thought.");
        save_thought(dir.path(), thought.clone()).unwrap();
        std::fs::write(dir.path().join(".tolaria/thoughts/bad.json"), "{not-json").unwrap();

        let thoughts = list_thoughts(dir.path()).unwrap();
        assert_eq!(thoughts, vec![thought]);
    }
}
```

- [ ] **Step 2: Run Rust test and verify failure**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml vault::thoughts
```

Expected: fail because `thought_sidecar_path`, `save_thought`, `read_note_thoughts`, `delete_thought`, and `list_thoughts` are undefined.

- [ ] **Step 3: Implement sidecar helper functions**

Add this implementation above the tests in `src-tauri/src/vault/thoughts.rs`:

```rust
const THOUGHTS_DIR: &str = ".tolaria/thoughts";

fn note_path_hex(note_path: &str) -> String {
    note_path
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

pub fn thought_sidecar_path(vault_path: &Path, note_path: &str) -> Result<PathBuf, String> {
    if note_path.trim().is_empty() {
        return Err("Thought note path is required".to_string());
    }
    Ok(vault_path.join(THOUGHTS_DIR).join(format!("{}.json", note_path_hex(note_path))))
}

fn read_thought_file(path: &Path) -> Result<Vec<ThoughtRecord>, String> {
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|error| format!("Failed to read thoughts file {}: {error}", path.display()))?;
    serde_json::from_str::<Vec<ThoughtRecord>>(&raw)
        .map_err(|error| format!("Failed to parse thoughts file {}: {error}", path.display()))
}

fn write_thought_file(path: &Path, thoughts: &[ThoughtRecord]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("Failed to create thoughts directory {}: {error}", parent.display()))?;
    }
    let raw = serde_json::to_string_pretty(thoughts)
        .map_err(|error| format!("Failed to serialize thoughts: {error}"))?;
    std::fs::write(path, raw)
        .map_err(|error| format!("Failed to write thoughts file {}: {error}", path.display()))
}

pub fn read_note_thoughts(vault_path: &Path, note_path: &str) -> Result<Vec<ThoughtRecord>, String> {
    let path = thought_sidecar_path(vault_path, note_path)?;
    read_thought_file(&path)
}

pub fn save_thought(vault_path: &Path, thought: ThoughtRecord) -> Result<ThoughtRecord, String> {
    if thought.id.trim().is_empty() {
        return Err("Thought id is required".to_string());
    }
    if thought.body_markdown.trim().is_empty() {
        return Err("Thought body is required".to_string());
    }
    let path = thought_sidecar_path(vault_path, &thought.note_path)?;
    let mut thoughts = read_thought_file(&path)?;
    if let Some(existing) = thoughts.iter_mut().find(|existing| existing.id == thought.id) {
        *existing = thought.clone();
    } else {
        thoughts.push(thought.clone());
    }
    write_thought_file(&path, &thoughts)?;
    Ok(thought)
}

pub fn delete_thought(vault_path: &Path, note_path: &str, thought_id: &str) -> Result<(), String> {
    let path = thought_sidecar_path(vault_path, note_path)?;
    let mut thoughts = read_thought_file(&path)?;
    thoughts.retain(|thought| thought.id != thought_id);
    write_thought_file(&path, &thoughts)
}

pub fn list_thoughts(vault_path: &Path) -> Result<Vec<ThoughtRecord>, String> {
    let dir = vault_path.join(THOUGHTS_DIR);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut thoughts = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|error| format!("Failed to read thoughts directory {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| format!("Failed to read thoughts directory entry: {error}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        match read_thought_file(&path) {
            Ok(mut file_thoughts) => thoughts.append(&mut file_thoughts),
            Err(error) => log::warn!("{error}"),
        }
    }
    thoughts.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(thoughts)
}
```

- [ ] **Step 4: Export vault helpers**

Modify `src-tauri/src/vault/mod.rs`:

```rust
pub mod thoughts;
```

Add it next to the other vault submodules.

- [ ] **Step 5: Add Tauri command wrappers**

Create `src-tauri/src/commands/vault/thought_cmds.rs`:

```rust
use crate::vault::thoughts::{self, ThoughtRecord};
use std::path::PathBuf;

use super::boundary::with_requested_root;

fn with_vault_root<T>(
    vault_path: PathBuf,
    action: impl FnOnce(&std::path::Path) -> Result<T, String>,
) -> Result<T, String> {
    let raw_vault_path = vault_path.to_string_lossy();
    with_requested_root(raw_vault_path.as_ref(), |requested_root| {
        action(std::path::Path::new(requested_root))
    })
}

#[tauri::command]
pub fn list_thoughts(vault_path: PathBuf) -> Result<Vec<ThoughtRecord>, String> {
    with_vault_root(vault_path, thoughts::list_thoughts)
}

#[tauri::command]
pub fn read_note_thoughts(vault_path: PathBuf, note_path: String) -> Result<Vec<ThoughtRecord>, String> {
    with_vault_root(vault_path, |root| thoughts::read_note_thoughts(root, &note_path))
}

#[tauri::command]
pub fn save_thought(vault_path: PathBuf, thought: ThoughtRecord) -> Result<ThoughtRecord, String> {
    with_vault_root(vault_path, |root| thoughts::save_thought(root, thought))
}

#[tauri::command]
pub fn delete_thought(vault_path: PathBuf, note_path: String, thought_id: String) -> Result<(), String> {
    with_vault_root(vault_path, |root| thoughts::delete_thought(root, &note_path, &thought_id))
}
```

- [ ] **Step 6: Register command module and exports**

Modify `src-tauri/src/commands/vault/mod.rs`:

```rust
mod thought_cmds;
pub use thought_cmds::*;
```

Modify `src-tauri/src/lib.rs` inside `app_invoke_handler!`:

```rust
commands::list_thoughts,
commands::read_note_thoughts,
commands::save_thought,
commands::delete_thought,
```

- [ ] **Step 7: Add command boundary tests**

Append to the existing `#[cfg(test)] mod tests` in `src-tauri/src/commands/vault.rs`:

```rust
#[test]
fn thought_commands_reject_missing_active_vault() {
    let err = list_thoughts(PathBuf::from("../outside")).unwrap_err();
    assert_eq!(err, ACTIVE_VAULT_PATH_ERROR);
}

#[test]
fn thought_commands_round_trip_inside_requested_vault() {
    let dir = tempfile::TempDir::new().unwrap();
    let thought = crate::vault::thoughts::ThoughtRecord {
        id: "thought-1".to_string(),
        note_path: "Articles/context.md".to_string(),
        note_title: "Context".to_string(),
        anchor: crate::vault::thoughts::ThoughtAnchor::Article,
        body_markdown: "Whole article note.".to_string(),
        created_at: "2026-05-03T08:00:00.000Z".to_string(),
        updated_at: "2026-05-03T08:00:00.000Z".to_string(),
    };

    save_thought(dir.path().into(), thought.clone()).unwrap();
    assert_eq!(read_note_thoughts(dir.path().into(), thought.note_path.clone()).unwrap(), vec![thought.clone()]);
    assert_eq!(list_thoughts(dir.path().into()).unwrap(), vec![thought.clone()]);
    delete_thought(dir.path().into(), thought.note_path.clone(), thought.id.clone()).unwrap();
    assert_eq!(read_note_thoughts(dir.path().into(), thought.note_path).unwrap(), Vec::new());
}
```

If `PathBuf` is not already imported in the test module, add:

```rust
use std::path::PathBuf;
```

- [ ] **Step 8: Run Rust tests**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml thoughts thought_commands
```

Expected: all thought persistence tests pass.

- [ ] **Step 9: Commit Rust persistence**

Run:

```bash
git add src-tauri/src/vault/thoughts.rs src-tauri/src/vault/mod.rs src-tauri/src/commands/vault/thought_cmds.rs src-tauri/src/commands/vault/mod.rs src-tauri/src/commands/vault.rs src-tauri/src/lib.rs
git commit -m "Persist article thoughts in vault sidecars" -m "Thoughts are user-authored records, so the app needs vault-bounded sidecar IO instead of mutating imported article Markdown." -m "Constraint: Sidecars must stay inside the selected vault under .tolaria/thoughts" -m "Rejected: Reuse save_note_content for sidecars | callers would need to construct hidden file paths and list records manually" -m "Confidence: high" -m "Scope-risk: moderate" -m "Tested: cargo test --manifest-path src-tauri/Cargo.toml thoughts thought_commands"
```

Expected: commit succeeds without `--no-verify`.

## Task 2: TypeScript Thought Utilities

**Files:**
- Create: `src/utils/thoughts.ts`
- Create: `src/utils/thoughts.test.ts`

- [ ] **Step 1: Write failing utility tests**

Create `src/utils/thoughts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildThoughtGroups,
  createArticleThoughtDraft,
  createSelectionThoughtDraft,
  filterThoughtGroups,
  matchThoughtAnchor,
  normalizeThoughtRecord,
  type ThoughtRecord,
} from './thoughts'

const baseThought: ThoughtRecord = {
  id: 'thought-1',
  notePath: '/vault/Articles/context.md',
  noteTitle: 'The Context and the Harness',
  anchor: {
    type: 'selection',
    quote: 'Retrieved documents are where context engineering intersects',
    prefix: 'The trade-off with few-shot examples is always token space.',
    suffix: 'formation retrieval, and this is what RAG systems are built around.',
    startOffset: 72,
    endOffset: 132,
  },
  bodyMarkdown: 'This is the retrieval-quality point.',
  createdAt: '2026-05-03T08:00:00.000Z',
  updatedAt: '2026-05-03T08:00:00.000Z',
}

describe('normalizeThoughtRecord', () => {
  it('accepts valid sidecar records', () => {
    expect(normalizeThoughtRecord(baseThought)).toEqual(baseThought)
  })

  it('rejects malformed records', () => {
    expect(normalizeThoughtRecord({ ...baseThought, id: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, bodyMarkdown: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, anchor: { type: 'selection', quote: '' } })).toBeNull()
  })
})

describe('thought grouping and filtering', () => {
  it('groups by source note in vault entry order', () => {
    const groups = buildThoughtGroups([
      { ...baseThought, notePath: '/vault/b.md', noteTitle: 'Beta' },
      { ...baseThought, id: 'thought-2', notePath: '/vault/a.md', noteTitle: 'Alpha' },
    ], ['/vault/a.md', '/vault/b.md'])

    expect(groups.map((group) => group.notePath)).toEqual(['/vault/a.md', '/vault/b.md'])
  })

  it('filters by thought body, quote, and title', () => {
    const groups = buildThoughtGroups([baseThought], [baseThought.notePath])

    expect(filterThoughtGroups(groups, 'retrieval-quality')).toHaveLength(1)
    expect(filterThoughtGroups(groups, 'Retrieved documents')).toHaveLength(1)
    expect(filterThoughtGroups(groups, 'Harness')).toHaveLength(1)
    expect(filterThoughtGroups(groups, 'not present')).toEqual([])
  })
})

describe('anchor drafts and matching', () => {
  const markdown = [
    '# Context',
    '',
    'The trade-off with few-shot examples is always token space.',
    'Retrieved documents are where context engineering intersects with information retrieval.',
  ].join('\n')

  it('creates selection anchors from selected text and markdown context', () => {
    const draft = createSelectionThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Draft body',
      selectedText: 'Retrieved documents are where context engineering intersects',
      markdown,
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-fixed',
    })

    expect(draft.anchor).toMatchObject({
      type: 'selection',
      quote: 'Retrieved documents are where context engineering intersects',
      startOffset: markdown.indexOf('Retrieved documents'),
    })
  })

  it('creates article anchors when no text is selected', () => {
    expect(createArticleThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Whole article thought',
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-fixed',
    }).anchor).toEqual({ type: 'article' })
  })

  it('matches by stored offsets, then exact quote', () => {
    const offsetMatch = matchThoughtAnchor(baseThought.anchor, markdown)
    expect(offsetMatch?.quote).toBe(baseThought.anchor.type === 'selection' ? baseThought.anchor.quote : '')

    const moved = `${baseThought.anchor.type === 'selection' ? baseThought.anchor.quote : ''}\n\n${markdown}`
    const fallback = matchThoughtAnchor(baseThought.anchor, moved)
    expect(fallback?.startOffset).toBe(0)
  })

  it('returns null when a selection anchor cannot be found', () => {
    expect(matchThoughtAnchor(baseThought.anchor, '# Other\n\nNo related text.')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
pnpm vitest run src/utils/thoughts.test.ts
```

Expected: fail because `src/utils/thoughts.ts` does not exist.

- [ ] **Step 3: Implement thought utility types and pure helpers**

Create `src/utils/thoughts.ts`:

```ts
export const THOUGHT_JUMP_EVENT = 'tolaria:thought-jump' as const
export const THOUGHT_PULSE_CLASS = 'tolaria-thought-pulse' as const
const CONTEXT_LENGTH = 80

export type ThoughtAnchor =
  | {
      type: 'selection'
      quote: string
      prefix: string
      suffix: string
      startOffset: number
      endOffset: number
    }
  | { type: 'article' }

export interface ThoughtRecord {
  id: string
  notePath: string
  noteTitle: string
  anchor: ThoughtAnchor
  bodyMarkdown: string
  createdAt: string
  updatedAt: string
}

export interface ThoughtGroup {
  notePath: string
  noteTitle: string
  thoughts: ThoughtRecord[]
}

export interface ThoughtAnchorMatch {
  thoughtId?: string
  quote: string
  startOffset: number
  endOffset: number
}

export interface ThoughtJumpEventDetail {
  thought: ThoughtRecord
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeAnchor(value: unknown): ThoughtAnchor | null {
  if (!isObject(value) || typeof value.type !== 'string') return null
  if (value.type === 'article') return { type: 'article' }
  if (value.type !== 'selection') return null
  if (!isNonEmptyString(value.quote)) return null
  if (typeof value.prefix !== 'string' || typeof value.suffix !== 'string') return null
  if (!isNumber(value.startOffset) || !isNumber(value.endOffset)) return null
  if (value.endOffset <= value.startOffset) return null

  return {
    type: 'selection',
    quote: value.quote,
    prefix: value.prefix,
    suffix: value.suffix,
    startOffset: value.startOffset,
    endOffset: value.endOffset,
  }
}

export function normalizeThoughtRecord(value: unknown): ThoughtRecord | null {
  if (!isObject(value)) return null
  const anchor = normalizeAnchor(value.anchor)
  if (!anchor) return null
  if (!isNonEmptyString(value.id)) return null
  if (!isNonEmptyString(value.notePath)) return null
  if (!isNonEmptyString(value.noteTitle)) return null
  if (!isNonEmptyString(value.bodyMarkdown)) return null
  if (!isNonEmptyString(value.createdAt)) return null
  if (!isNonEmptyString(value.updatedAt)) return null

  return {
    id: value.id,
    notePath: value.notePath,
    noteTitle: value.noteTitle,
    anchor,
    bodyMarkdown: value.bodyMarkdown,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

export function buildThoughtGroups(thoughts: ThoughtRecord[], orderedNotePaths: string[]): ThoughtGroup[] {
  const order = new Map(orderedNotePaths.map((path, index) => [path, index]))
  const grouped = new Map<string, ThoughtGroup>()

  for (const thought of thoughts) {
    const group = grouped.get(thought.notePath) ?? {
      notePath: thought.notePath,
      noteTitle: thought.noteTitle,
      thoughts: [],
    }
    group.thoughts.push(thought)
    grouped.set(thought.notePath, group)
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftOrder = order.get(left.notePath) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(right.notePath) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.noteTitle.localeCompare(right.noteTitle)
  })
}

export function filterThoughtGroups(groups: ThoughtGroup[], query: string): ThoughtGroup[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return groups

  return groups
    .map((group) => {
      const titleMatches = group.noteTitle.toLowerCase().includes(normalized)
      const thoughts = titleMatches
        ? group.thoughts
        : group.thoughts.filter((thought) => {
          const quote = thought.anchor.type === 'selection' ? thought.anchor.quote : ''
          return thought.bodyMarkdown.toLowerCase().includes(normalized)
            || quote.toLowerCase().includes(normalized)
        })
      return { ...group, thoughts }
    })
    .filter((group) => group.thoughts.length > 0)
}

function createThoughtId() {
  return `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function contextBefore(markdown: string, startOffset: number) {
  return markdown.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset)
}

function contextAfter(markdown: string, endOffset: number) {
  return markdown.slice(endOffset, Math.min(markdown.length, endOffset + CONTEXT_LENGTH))
}

export function createSelectionThoughtDraft(options: {
  notePath: string
  noteTitle: string
  selectedText: string
  markdown: string
  bodyMarkdown: string
  now?: string
  id?: string
}): ThoughtRecord {
  const now = options.now ?? new Date().toISOString()
  const quote = options.selectedText.replace(/\s+/g, ' ').trim()
  const startOffset = options.markdown.indexOf(quote)
  const safeStart = startOffset >= 0 ? startOffset : 0
  const safeEnd = safeStart + quote.length

  return {
    id: options.id ?? createThoughtId(),
    notePath: options.notePath,
    noteTitle: options.noteTitle,
    anchor: {
      type: 'selection',
      quote,
      prefix: contextBefore(options.markdown, safeStart),
      suffix: contextAfter(options.markdown, safeEnd),
      startOffset: safeStart,
      endOffset: safeEnd,
    },
    bodyMarkdown: options.bodyMarkdown.trim(),
    createdAt: now,
    updatedAt: now,
  }
}

export function createArticleThoughtDraft(options: {
  notePath: string
  noteTitle: string
  bodyMarkdown: string
  now?: string
  id?: string
}): ThoughtRecord {
  const now = options.now ?? new Date().toISOString()
  return {
    id: options.id ?? createThoughtId(),
    notePath: options.notePath,
    noteTitle: options.noteTitle,
    anchor: { type: 'article' },
    bodyMarkdown: options.bodyMarkdown.trim(),
    createdAt: now,
    updatedAt: now,
  }
}

function contextScore(markdown: string, startOffset: number, endOffset: number, anchor: Extract<ThoughtAnchor, { type: 'selection' }>) {
  let score = 0
  if (anchor.prefix && markdown.slice(Math.max(0, startOffset - anchor.prefix.length), startOffset) === anchor.prefix) score += 1
  if (anchor.suffix && markdown.slice(endOffset, endOffset + anchor.suffix.length) === anchor.suffix) score += 1
  return score
}

export function matchThoughtAnchor(anchor: ThoughtAnchor, markdown: string): ThoughtAnchorMatch | null {
  if (anchor.type === 'article') {
    return { quote: '', startOffset: 0, endOffset: 0 }
  }

  const expected = markdown.slice(anchor.startOffset, anchor.endOffset)
  if (expected === anchor.quote) {
    return {
      quote: anchor.quote,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    }
  }

  const matches: ThoughtAnchorMatch[] = []
  let index = markdown.indexOf(anchor.quote)
  while (index >= 0) {
    matches.push({
      quote: anchor.quote,
      startOffset: index,
      endOffset: index + anchor.quote.length,
    })
    index = markdown.indexOf(anchor.quote, index + anchor.quote.length)
  }

  if (matches.length === 0) return null
  return matches.sort((left, right) => (
    contextScore(markdown, right.startOffset, right.endOffset, anchor)
    - contextScore(markdown, left.startOffset, left.endOffset, anchor)
  ))[0]
}
```

- [ ] **Step 4: Run utility tests**

Run:

```bash
pnpm vitest run src/utils/thoughts.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit utilities**

Run:

```bash
git add src/utils/thoughts.ts src/utils/thoughts.test.ts
git commit -m "Model article thoughts on the frontend" -m "The UI needs pure validation, grouping, filtering, and anchor matching before sidecar data can be rendered or edited safely." -m "Constraint: Thought anchors are best-effort because article text can change after capture" -m "Rejected: Store DOM selectors as anchors | BlockNote markup is not a stable persistence format" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: pnpm vitest run src/utils/thoughts.test.ts"
```

## Task 3: Thoughts Index Hook And Mock Commands

**Files:**
- Create: `src/hooks/useThoughtsIndex.ts`
- Create: `src/hooks/useThoughtsIndex.test.tsx`
- Modify: `src/mock-tauri/mock-handlers.ts`

- [ ] **Step 1: Add mock Tauri handlers**

In `src/mock-tauri/mock-handlers.ts`, add near the other module-level mock state:

```ts
import type { ThoughtRecord } from '../utils/thoughts'

let mockThoughts: ThoughtRecord[] = []
```

Inside `mockHandlers`, add:

```ts
list_thoughts: () => mockThoughts,
read_note_thoughts: (args: { notePath: string }) => (
  mockThoughts.filter((thought) => thought.notePath === args.notePath)
),
save_thought: (args: { thought: ThoughtRecord }) => {
  mockThoughts = [
    ...mockThoughts.filter((thought) => thought.id !== args.thought.id),
    args.thought,
  ]
  return args.thought
},
delete_thought: (args: { notePath: string; thoughtId: string }) => {
  mockThoughts = mockThoughts.filter((thought) => (
    thought.notePath !== args.notePath || thought.id !== args.thoughtId
  ))
  return null
},
__reset_thoughts_for_tests: () => {
  mockThoughts = []
  return null
},
```

- [ ] **Step 2: Write failing hook tests**

Create `src/hooks/useThoughtsIndex.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { useThoughtsIndex } from './useThoughtsIndex'
import type { ThoughtRecord } from '../utils/thoughts'
import type { VaultEntry } from '../types'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const entry: VaultEntry = {
  path: '/vault/context.md',
  filename: 'context.md',
  title: 'Context',
  isA: 'Article',
  aliases: [],
  belongsTo: [],
  relatedTo: [],
  status: null,
  archived: false,
  modifiedAt: 1,
  createdAt: 1,
  fileSize: 10,
  snippet: '',
  wordCount: 5,
  relationships: {},
  icon: null,
  color: null,
  order: null,
  sidebarLabel: null,
  template: null,
  sort: null,
  view: null,
  visible: null,
  organized: true,
  favorite: false,
  favoriteIndex: null,
  listPropertiesDisplay: [],
  outgoingLinks: [],
  properties: {},
  hasH1: true,
  fileKind: 'markdown',
}

const thought: ThoughtRecord = {
  id: 'thought-1',
  notePath: entry.path,
  noteTitle: entry.title,
  anchor: { type: 'article' },
  bodyMarkdown: 'This article-level thought should be searchable.',
  createdAt: '2026-05-03T08:00:00.000Z',
  updatedAt: '2026-05-03T08:00:00.000Z',
}

beforeEach(() => {
  vi.mocked(invoke).mockReset()
})

describe('useThoughtsIndex', () => {
  it('stays empty until enabled', () => {
    const { result } = renderHook(() => useThoughtsIndex({
      entries: [entry],
      enabled: false,
      vaultPath: '/vault',
    }))

    expect(result.current.thoughts).toEqual([])
    expect(invoke).not.toHaveBeenCalled()
  })

  it('loads and groups thoughts when enabled', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([thought])

    const { result } = renderHook(() => useThoughtsIndex({
      entries: [entry],
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(invoke).toHaveBeenCalledWith('list_thoughts', { vaultPath: '/vault' })
    expect(result.current.groups[0].thoughts[0]).toEqual(thought)
  })

  it('saves and deletes thoughts then refreshes state', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(thought)
      .mockResolvedValueOnce([thought])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useThoughtsIndex({
      entries: [entry],
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveThought(thought)
    })
    expect(result.current.thoughts).toEqual([thought])

    await act(async () => {
      await result.current.deleteThought(thought)
    })
    expect(result.current.thoughts).toEqual([])
  })
})
```

- [ ] **Step 3: Run hook tests and verify failure**

Run:

```bash
pnpm vitest run src/hooks/useThoughtsIndex.test.tsx
```

Expected: fail because `useThoughtsIndex.ts` does not exist.

- [ ] **Step 4: Implement `useThoughtsIndex`**

Create `src/hooks/useThoughtsIndex.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { VaultEntry } from '../types'
import {
  buildThoughtGroups,
  normalizeThoughtRecord,
  type ThoughtGroup,
  type ThoughtRecord,
} from '../utils/thoughts'

interface UseThoughtsIndexOptions {
  entries: VaultEntry[]
  enabled: boolean
  vaultPath?: string | null
}

interface ThoughtsIndexState {
  groups: ThoughtGroup[]
  thoughts: ThoughtRecord[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  saveThought: (thought: ThoughtRecord) => Promise<ThoughtRecord>
  deleteThought: (thought: ThoughtRecord) => Promise<void>
}

const EMPTY_STATE = {
  groups: [],
  thoughts: [],
  loading: false,
  error: null,
}

function normalizeThoughts(raw: unknown): ThoughtRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value) => {
    const thought = normalizeThoughtRecord(value)
    return thought ? [thought] : []
  })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function useThoughtsIndex({
  entries,
  enabled,
  vaultPath,
}: UseThoughtsIndexOptions): ThoughtsIndexState {
  const normalizedVaultPath = vaultPath ?? null
  const orderedPaths = useMemo(() => entries.map((entry) => entry.path), [entries])
  const [state, setState] = useState<typeof EMPTY_STATE & { thoughts: ThoughtRecord[]; groups: ThoughtGroup[] }>(EMPTY_STATE)

  const buildState = useCallback((thoughts: ThoughtRecord[]) => ({
    thoughts,
    groups: buildThoughtGroups(thoughts, orderedPaths),
    loading: false,
    error: null,
  }), [orderedPaths])

  const refresh = useCallback(async () => {
    if (!enabled || !normalizedVaultPath) {
      setState(EMPTY_STATE)
      return
    }

    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const raw = await invoke<unknown>('list_thoughts', { vaultPath: normalizedVaultPath })
      setState(buildState(normalizeThoughts(raw)))
    } catch (error) {
      setState({ ...EMPTY_STATE, error: errorMessage(error) })
    }
  }, [buildState, enabled, normalizedVaultPath])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveThought = useCallback(async (thought: ThoughtRecord) => {
    if (!normalizedVaultPath) throw new Error('No vault is open')
    const saved = await invoke<ThoughtRecord>('save_thought', {
      vaultPath: normalizedVaultPath,
      thought,
    })
    await refresh()
    return saved
  }, [normalizedVaultPath, refresh])

  const deleteThought = useCallback(async (thought: ThoughtRecord) => {
    if (!normalizedVaultPath) throw new Error('No vault is open')
    await invoke('delete_thought', {
      vaultPath: normalizedVaultPath,
      notePath: thought.notePath,
      thoughtId: thought.id,
    })
    await refresh()
  }, [normalizedVaultPath, refresh])

  return enabled
    ? { ...state, refresh, saveThought, deleteThought }
    : { ...EMPTY_STATE, refresh, saveThought, deleteThought }
}
```

- [ ] **Step 5: Run hook tests**

Run:

```bash
pnpm vitest run src/hooks/useThoughtsIndex.test.tsx
```

Expected: all hook tests pass.

- [ ] **Step 6: Commit hook and mocks**

Run:

```bash
git add src/hooks/useThoughtsIndex.ts src/hooks/useThoughtsIndex.test.tsx src/mock-tauri/mock-handlers.ts
git commit -m "Index article thoughts from sidecar records" -m "The sidebar and editor need a shared lazy index that can refresh after create, edit, and delete operations." -m "Constraint: The hook only loads when the Thoughts surface or editor integration needs it" -m "Rejected: Scan hidden sidecar files through normal vault entries | hidden Tolaria metadata should not appear as notes" -m "Confidence: high" -m "Scope-risk: moderate" -m "Tested: pnpm vitest run src/hooks/useThoughtsIndex.test.tsx"
```

## Task 4: Sidebar Thoughts Collection

**Files:**
- Create: `src/components/note-list/ThoughtsList.tsx`
- Create: `src/components/note-list/ThoughtsList.test.tsx`
- Modify: `src/types.ts`
- Modify: `src/components/sidebar/SidebarTopNav.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`
- Modify: `src/components/note-list/useNoteListModel.tsx`
- Modify: `src/components/note-list/NoteListLayout.tsx`
- Modify: `src/components/note-list/noteListUtils.ts`
- Modify: `src/utils/noteListHelpers.ts`
- Modify: `src/lib/locales/en-US.json`

- [ ] **Step 1: Write failing `ThoughtsList` tests**

Create `src/components/note-list/ThoughtsList.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThoughtsList } from './ThoughtsList'
import type { ThoughtGroup, ThoughtRecord } from '../../utils/thoughts'

const thought: ThoughtRecord = {
  id: 'thought-1',
  notePath: '/vault/context.md',
  noteTitle: 'Context',
  anchor: {
    type: 'selection',
    quote: 'Retrieved documents are where context engineering intersects',
    prefix: '',
    suffix: '',
    startOffset: 0,
    endOffset: 60,
  },
  bodyMarkdown: 'This is my note about retrieval quality.',
  createdAt: '2026-05-03T08:00:00.000Z',
  updatedAt: '2026-05-03T08:00:00.000Z',
}

const groups: ThoughtGroup[] = [{
  notePath: thought.notePath,
  noteTitle: thought.noteTitle,
  thoughts: [thought],
}]

describe('ThoughtsList', () => {
  it('renders grouped thoughts and opens a row', () => {
    const onOpenThought = vi.fn()
    render(<ThoughtsList groups={groups} loading={false} error={null} onOpenThought={onOpenThought} />)

    fireEvent.click(screen.getByRole('button', { name: /This is my note/ }))
    expect(onOpenThought).toHaveBeenCalledWith(thought)
  })

  it('filters by quote text', () => {
    render(<ThoughtsList groups={groups} loading={false} error={null} onOpenThought={() => undefined} />)

    fireEvent.change(screen.getByPlaceholderText('Filter thoughts'), { target: { value: 'retrieved documents' } })
    expect(screen.getByText(/This is my note/)).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('Filter thoughts'), { target: { value: 'missing' } })
    expect(screen.getByText('No matching thoughts')).toBeInTheDocument()
  })

  it('shows loading, error, and empty states', () => {
    const { rerender } = render(<ThoughtsList groups={[]} loading error={null} onOpenThought={() => undefined} />)
    expect(screen.getByText('Loading thoughts...')).toBeInTheDocument()

    rerender(<ThoughtsList groups={[]} loading={false} error="broken" onOpenThought={() => undefined} />)
    expect(screen.getByText('Could not load thoughts')).toBeInTheDocument()

    rerender(<ThoughtsList groups={[]} loading={false} error={null} onOpenThought={() => undefined} />)
    expect(screen.getByText('No thoughts yet')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Implement `ThoughtsList`**

Create `src/components/note-list/ThoughtsList.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { ChatCenteredText } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Input } from '../ui/input'
import { EmptyMessage } from './TrashWarningBanner'
import {
  filterThoughtGroups,
  type ThoughtGroup,
  type ThoughtRecord,
} from '../../utils/thoughts'

interface ThoughtsListProps {
  groups: ThoughtGroup[]
  loading: boolean
  error: string | null
  onOpenThought: (thought: ThoughtRecord) => void
}

function quoteFor(thought: ThoughtRecord) {
  return thought.anchor.type === 'selection' ? thought.anchor.quote : 'Whole article'
}

export function ThoughtsList({
  groups,
  loading,
  error,
  onOpenThought,
}: ThoughtsListProps) {
  const [query, setQuery] = useState('')
  const filteredGroups = useMemo(
    () => filterThoughtGroups(groups, query),
    [groups, query],
  )

  if (loading) return <EmptyMessage text="Loading thoughts..." />
  if (error) return <EmptyMessage text="Could not load thoughts" />

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <Input
          aria-label="Filter thoughts"
          placeholder="Filter thoughts"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.length === 0 ? (
          <EmptyMessage text="No thoughts yet" />
        ) : filteredGroups.length === 0 ? (
          <EmptyMessage text="No matching thoughts" />
        ) : (
          filteredGroups.map((group) => (
            <section key={group.notePath} className="mb-4 last:mb-0">
              <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.noteTitle}
              </div>
              <div className="space-y-1">
                {group.thoughts.map((thought) => (
                  <Button
                    key={thought.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full items-start justify-start gap-2 whitespace-normal rounded-md px-2 py-2 text-left text-sm"
                    onClick={() => onOpenThought(thought)}
                  >
                    <ChatCenteredText className="mt-0.5 h-4 w-4 shrink-0 text-primary" weight="fill" />
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-foreground">{thought.bodyMarkdown}</span>
                      <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{quoteFor(thought)}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run list tests**

Run:

```bash
pnpm vitest run src/components/note-list/ThoughtsList.test.tsx
```

Expected: tests pass.

- [ ] **Step 4: Add sidebar filter type and top nav row**

Modify `src/types.ts`:

```ts
export type SidebarFilter = 'all' | 'archived' | 'changes' | 'pulse' | 'inbox' | 'favorites' | 'highlights' | 'thoughts'
```

Modify `src/components/sidebar/SidebarTopNav.tsx`:

```tsx
import { Archive, ChatCenteredText, FileText, Highlighter, Tray } from '@phosphor-icons/react'
```

Add `thoughtCount: number` to `SidebarTopNavProps`, destructure it, then insert this `NavItem` after Highlights:

```tsx
<NavItem
  icon={ChatCenteredText}
  label="Thoughts"
  count={thoughtCount}
  isActive={isSelectionActive(selection, { kind: 'filter', filter: 'thoughts' })}
  badgeClassName="text-muted-foreground"
  badgeStyle={{ background: 'var(--muted)' }}
  activeBadgeClassName="bg-primary text-primary-foreground"
  onClick={() => onSelect({ kind: 'filter', filter: 'thoughts' })}
/>
```

Modify `src/components/Sidebar.tsx` to accept and pass `thoughtCount`. Keep the default `0` at the public `Sidebar` boundary so existing tests do not need to pass it.

- [ ] **Step 5: Branch NoteList to `ThoughtsList`**

Modify `src/components/note-list/useNoteListModel.tsx`:

```ts
import type { ThoughtGroup, ThoughtRecord } from '../../utils/thoughts'
```

Add props:

```ts
thoughtGroups?: ThoughtGroup[]
thoughtLoading?: boolean
thoughtError?: string | null
onOpenThought?: (thought: ThoughtRecord) => void
```

Add `isThoughtsView` beside `isHighlightsView`:

```ts
const isThoughtsView = selection.kind === 'filter' && selection.filter === 'thoughts'
```

Carry `isThoughtsView`, `thoughtGroups`, `thoughtLoading`, `thoughtError`, and `onOpenThought` through `buildNoteListLayoutModel`.

Modify `src/components/note-list/NoteListLayout.tsx` to import and render:

```tsx
import { ThoughtsList } from './ThoughtsList'
```

Before the normal list content branch:

```tsx
if (model.isThoughtsView) {
  return (
    <ThoughtsList
      groups={model.thoughtGroups}
      loading={model.thoughtLoading}
      error={model.thoughtError}
      onOpenThought={model.onOpenThought ?? (() => undefined)}
    />
  )
}
```

Modify `src/components/note-list/noteListUtils.ts` so `resolveHeaderTitle` returns `Thoughts` for `{ kind: 'filter', filter: 'thoughts' }`.

Modify `src/utils/noteListHelpers.ts` so `filterEntries` returns `[]` for `thoughts`, the same way hidden synthetic views should not render normal note rows.

- [ ] **Step 6: Add sidebar/list integration tests**

In `src/components/Sidebar.test.tsx`, add:

```tsx
it('renders Thoughts as a top-level nav item with count', () => {
  render(
    <Sidebar
      entries={[]}
      selection={{ kind: 'filter', filter: 'all' }}
      onSelect={() => undefined}
      thoughtCount={3}
    />,
  )

  expect(screen.getByText('Thoughts')).toBeInTheDocument()
  expect(screen.getByText('3')).toBeInTheDocument()
})
```

If `SidebarProps` is not exported in tests, follow the existing render helper in the file and add `thoughtCount: 3` there.

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
pnpm vitest run src/components/note-list/ThoughtsList.test.tsx src/components/Sidebar.test.tsx src/components/NoteList.rendering.test.tsx
```

Expected: tests pass.

- [ ] **Step 8: Commit sidebar collection**

Run:

```bash
git add src/components/note-list/ThoughtsList.tsx src/components/note-list/ThoughtsList.test.tsx src/types.ts src/components/sidebar/SidebarTopNav.tsx src/components/Sidebar.tsx src/components/Sidebar.test.tsx src/components/note-list/useNoteListModel.tsx src/components/note-list/NoteListLayout.tsx src/components/note-list/noteListUtils.ts src/utils/noteListHelpers.ts src/lib/locales
git commit -m "Show article thoughts as a sidebar collection" -m "Thoughts need a first-class browsing surface parallel to Highlights, grouped by source note and searchable by user note, quote, and title." -m "Constraint: Thoughts are synthetic records and must not make the normal note list render hidden sidecar files" -m "Rejected: Put thoughts under Highlights | the product distinguishes marked text from user-authored commentary" -m "Confidence: high" -m "Scope-risk: moderate" -m "Tested: pnpm vitest run src/components/note-list/ThoughtsList.test.tsx src/components/Sidebar.test.tsx src/components/NoteList.rendering.test.tsx"
```

## Task 5: Editor Thought Popover, Toolbar Action, Pins, And Jumps

**Files:**
- Create: `src/components/thoughts/ThoughtPopover.tsx`
- Create: `src/components/thoughts/ThoughtPinsLayer.tsx`
- Create: `src/components/thoughts/ThoughtPinsLayer.test.tsx`
- Modify: `src/components/tolariaEditorFormatting.tsx`
- Modify: `src/components/tolariaEditorFormatting.behavior.test.tsx`
- Modify: `src/components/SingleEditorView.tsx`
- Modify: `src/components/Editor.tsx`
- Modify: `src/components/EditorContent.tsx`
- Modify: `src/components/editor-content/useEditorContentModel.ts`
- Modify: `src/components/editor-content/EditorContentLayout.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing pin layer tests**

Create `src/components/thoughts/ThoughtPinsLayer.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ThoughtPinsLayer } from './ThoughtPinsLayer'
import type { ThoughtRecord } from '../../utils/thoughts'

const thought: ThoughtRecord = {
  id: 'thought-1',
  notePath: '/vault/context.md',
  noteTitle: 'Context',
  anchor: {
    type: 'selection',
    quote: 'Retrieved documents are where context engineering intersects',
    prefix: '',
    suffix: '',
    startOffset: 0,
    endOffset: 60,
  },
  bodyMarkdown: 'Remember retrieval quality.',
  createdAt: '2026-05-03T08:00:00.000Z',
  updatedAt: '2026-05-03T08:00:00.000Z',
}

describe('ThoughtPinsLayer', () => {
  it('renders one pin per matched thought', () => {
    render(
      <ThoughtPinsLayer
        thoughts={[thought]}
        markdown="Retrieved documents are where context engineering intersects with information retrieval."
        onOpenThought={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: 'Open thought' })).toBeInTheDocument()
  })

  it('does not render pins for article thoughts or missing anchors', () => {
    const { rerender } = render(
      <ThoughtPinsLayer
        thoughts={[{ ...thought, anchor: { type: 'article' } }]}
        markdown="Retrieved documents are where context engineering intersects."
        onOpenThought={() => undefined}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Open thought' })).not.toBeInTheDocument()

    rerender(<ThoughtPinsLayer thoughts={[thought]} markdown="No match" onOpenThought={() => undefined} />)
    expect(screen.queryByRole('button', { name: 'Open thought' })).not.toBeInTheDocument()
  })

  it('opens a thought from a pin', () => {
    const onOpenThought = vi.fn()
    render(
      <ThoughtPinsLayer
        thoughts={[thought]}
        markdown="Retrieved documents are where context engineering intersects."
        onOpenThought={onOpenThought}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open thought' }))
    expect(onOpenThought).toHaveBeenCalledWith(thought)
  })
})
```

- [ ] **Step 2: Implement `ThoughtPinsLayer`**

Create `src/components/thoughts/ThoughtPinsLayer.tsx`:

```tsx
import { ChatCenteredText } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { matchThoughtAnchor, type ThoughtRecord } from '../../utils/thoughts'

interface ThoughtPinsLayerProps {
  thoughts: ThoughtRecord[]
  markdown: string
  onOpenThought: (thought: ThoughtRecord) => void
}

export function ThoughtPinsLayer({
  thoughts,
  markdown,
  onOpenThought,
}: ThoughtPinsLayerProps) {
  const matched = thoughts
    .map((thought) => ({
      thought,
      match: thought.anchor.type === 'selection' ? matchThoughtAnchor(thought.anchor, markdown) : null,
    }))
    .filter((item): item is { thought: ThoughtRecord; match: NonNullable<typeof item.match> } => item.match !== null)

  if (matched.length === 0) return null

  return (
    <div className="tolaria-thought-pins" aria-hidden={false}>
      {matched.map(({ thought }, index) => (
        <Button
          key={thought.id}
          type="button"
          variant="ghost"
          size="icon"
          className="tolaria-thought-pin"
          style={{ top: `${32 + index * 32}px` }}
          aria-label="Open thought"
          onClick={(event) => {
            event.stopPropagation()
            onOpenThought(thought)
          }}
        >
          <ChatCenteredText className="h-4 w-4" weight="fill" />
        </Button>
      ))}
    </div>
  )
}
```

This first version stacks pins predictably. A later refactor can calculate exact vertical offsets from DOM ranges once the rest of the feature is stable.

- [ ] **Step 3: Create thought popover**

Create `src/components/thoughts/ThoughtPopover.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import type { ThoughtRecord } from '../../utils/thoughts'

interface ThoughtPopoverProps {
  open: boolean
  anchorLabel: string
  thought: ThoughtRecord | null
  initialBody?: string
  trigger: React.ReactNode
  onOpenChange: (open: boolean) => void
  onSave: (bodyMarkdown: string) => Promise<void> | void
  onDelete?: () => Promise<void> | void
}

export function ThoughtPopover({
  open,
  anchorLabel,
  thought,
  initialBody = '',
  trigger,
  onOpenChange,
  onSave,
  onDelete,
}: ThoughtPopoverProps) {
  const [body, setBody] = useState(initialBody)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setBody(thought?.bodyMarkdown ?? initialBody)
  }, [initialBody, open, thought?.bodyMarkdown])

  const canSave = body.trim().length > 0 && !saving

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="line-clamp-3 rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
            {anchorLabel}
          </div>
          <Textarea
            aria-label="Thought"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a thought"
            rows={5}
          />
          <div className="flex items-center justify-between gap-2">
            {thought && onDelete ? (
              <Button type="button" variant="ghost" onClick={() => onDelete()}>
                Delete
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!canSave}
                onClick={async () => {
                  setSaving(true)
                  try {
                    await onSave(body.trim())
                    onOpenChange(false)
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 4: Add optional toolbar thought action**

Modify `src/components/tolariaEditorFormatting.tsx`:

```ts
import { MessageSquarePlus } from 'lucide-react'
```

Add a module-level event:

```ts
export const ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT = 'tolaria:add-thought-from-formatting-toolbar'
```

Add a button component:

```tsx
function TolariaAddThoughtButton() {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const buttonState = useEditorState({
    editor,
    selector: ({ editor }) => editor.isEditable && selectionSupportsInlineFormatting(editor),
  })

  if (!buttonState) return null

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="add-thought"
      onClick={() => window.dispatchEvent(new CustomEvent(ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT))}
      isSelected={false}
      label="Add thought"
      mainTooltip="Add thought"
      secondaryTooltip="Save a note on this passage"
      icon={<MessageSquarePlus />}
    />
  )
}
```

Insert the button after the highlight/code buttons in `insertHighlightAndInlineCodeButtons`:

```tsx
<TolariaAddThoughtButton key="addThoughtButton" />,
```

- [ ] **Step 5: Wire editor props through to `SingleEditorView`**

Add these props to `EditorProps`, `EditorLayout`, `EditorContentProps`, and `EditorContentLayout`:

```ts
thoughts?: ThoughtRecord[]
onSaveThought?: (thought: ThoughtRecord) => Promise<ThoughtRecord>
onDeleteThought?: (thought: ThoughtRecord) => Promise<void>
pendingThoughtJump?: ThoughtRecord | null
onThoughtJumpHandled?: (thoughtId: string) => void
onThoughtError?: (message: string) => void
```

Import `ThoughtRecord` from `../utils/thoughts` or `../../utils/thoughts` depending on file depth.

Pass those props unchanged down to `SingleEditorView`.

- [ ] **Step 6: Implement editor create/edit/delete state**

Modify `src/components/SingleEditorView.tsx` to import:

```ts
import {
  ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT,
} from './tolariaEditorFormatting'
import {
  createArticleThoughtDraft,
  createSelectionThoughtDraft,
  THOUGHT_JUMP_EVENT,
  type ThoughtJumpEventDetail,
  type ThoughtRecord,
} from '../utils/thoughts'
import { ThoughtPinsLayer } from './thoughts/ThoughtPinsLayer'
import { ThoughtPopover } from './thoughts/ThoughtPopover'
```

Extend `SingleEditorView` props:

```ts
thoughts?: ThoughtRecord[]
onSaveThought?: (thought: ThoughtRecord) => Promise<ThoughtRecord>
onDeleteThought?: (thought: ThoughtRecord) => Promise<void>
pendingThoughtJump?: ThoughtRecord | null
onThoughtJumpHandled?: (thoughtId: string) => void
onThoughtError?: (message: string) => void
```

Inside `SingleEditorView`, add state:

```ts
const [draftThought, setDraftThought] = useState<ThoughtRecord | null>(null)
const [openThought, setOpenThought] = useState<ThoughtRecord | null>(null)
const [thoughtPopoverOpen, setThoughtPopoverOpen] = useState(false)
```

Add helper:

```ts
const activeEntry = entries.find((entry) => entry.path === activeNotePath)
const activeMarkdown = activeEntry && activeNotePath ? (window.__mockContent?.[activeNotePath] ?? '') : ''

const selectedText = () => {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return ''
  const container = containerRef.current
  if (!container || !selection.anchorNode || !container.contains(selection.anchorNode)) return ''
  return selection.toString().replace(/\s+/g, ' ').trim()
}

const openCreateThought = useCallback(() => {
  if (!activeEntry || !activeNotePath) return
  const quote = selectedText()
  const bodyMarkdown = ' '
  const draft = quote
    ? createSelectionThoughtDraft({
        notePath: activeNotePath,
        noteTitle: activeEntry.title,
        selectedText: quote,
        markdown: activeMarkdown,
        bodyMarkdown,
      })
    : createArticleThoughtDraft({
        notePath: activeNotePath,
        noteTitle: activeEntry.title,
        bodyMarkdown,
      })
  setDraftThought(draft)
  setOpenThought(null)
  setThoughtPopoverOpen(true)
}, [activeEntry, activeMarkdown, activeNotePath])
```

Pass `activeTab.content` into `SingleEditorView` as `activeMarkdown` through the existing `EditorContent` prop chain. Do not read `window.__mockContent` from production editor code.

Add event listener:

```ts
useEffect(() => {
  window.addEventListener(ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT, openCreateThought)
  return () => window.removeEventListener(ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT, openCreateThought)
}, [openCreateThought])
```

Add save/delete handlers:

```ts
const handleSaveThoughtBody = useCallback(async (bodyMarkdown: string) => {
  const source = openThought ?? draftThought
  if (!source || !onSaveThought) return
  const now = new Date().toISOString()
  await onSaveThought({
    ...source,
    bodyMarkdown,
    updatedAt: now,
    createdAt: source.createdAt || now,
  })
  setDraftThought(null)
  setOpenThought(null)
}, [draftThought, onSaveThought, openThought])

const handleDeleteThought = useCallback(async () => {
  if (!openThought || !onDeleteThought) return
  await onDeleteThought(openThought)
  setOpenThought(null)
  setThoughtPopoverOpen(false)
}, [onDeleteThought, openThought])
```

Render `ThoughtPinsLayer` inside the editor container before `SharedContextBlockNoteView`:

```tsx
<ThoughtPinsLayer
  thoughts={(thoughts ?? []).filter((thought) => thought.notePath === activeNotePath)}
  markdown={activeMarkdown}
  onOpenThought={(thought) => {
    setOpenThought(thought)
    setDraftThought(null)
    setThoughtPopoverOpen(true)
  }}
/>
```

Render `ThoughtPopover` with a hidden trigger after `SharedContextBlockNoteView`:

```tsx
<ThoughtPopover
  open={thoughtPopoverOpen}
  onOpenChange={setThoughtPopoverOpen}
  thought={openThought}
  initialBody={draftThought?.bodyMarkdown.trim() ?? ''}
  anchorLabel={
    (openThought ?? draftThought)?.anchor.type === 'selection'
      ? ((openThought ?? draftThought)?.anchor as Extract<ThoughtRecord['anchor'], { type: 'selection' }>).quote
      : 'Whole article'
  }
  trigger={<button type="button" className="sr-only" aria-label="Thought popover trigger" />}
  onSave={handleSaveThoughtBody}
  onDelete={openThought ? handleDeleteThought : undefined}
/>
```

- [ ] **Step 7: Add thought jump listener**

In `SingleEditorView`, add:

```ts
useEffect(() => {
  const handleJump = (event: Event) => {
    const detail = (event as CustomEvent<ThoughtJumpEventDetail>).detail
    const thought = detail?.thought
    if (!thought || thought.notePath !== activeNotePath) return

    if (thought.anchor.type === 'article') {
      containerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    } else {
      const quote = thought.anchor.quote
      const target = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('.bn-block') ?? [])
        .find((element) => element.textContent?.includes(quote))
      if (target) {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        target.classList.add('tolaria-thought-pulse')
        window.setTimeout(() => target.classList.remove('tolaria-thought-pulse'), 1400)
      } else {
        onThoughtError?.('Thought anchor could not be found in this note.')
      }
    }

    setOpenThought(thought)
    setDraftThought(null)
    setThoughtPopoverOpen(true)
    onThoughtJumpHandled?.(thought.id)
  }

  window.addEventListener(THOUGHT_JUMP_EVENT, handleJump)
  return () => window.removeEventListener(THOUGHT_JUMP_EVENT, handleJump)
}, [activeNotePath, onThoughtError, onThoughtJumpHandled])
```

- [ ] **Step 8: Wire `App.tsx`**

In `src/App.tsx`, import:

```ts
import { useThoughtsIndex } from './hooks/useThoughtsIndex'
import {
  THOUGHT_JUMP_EVENT,
  type ThoughtJumpEventDetail,
  type ThoughtRecord,
} from './utils/thoughts'
```

After `useHighlightsIndex`, add:

```ts
const thoughtsIndex = useThoughtsIndex({
  entries: vault.entries,
  enabled: effectiveSelection.kind === 'filter' && effectiveSelection.filter === 'thoughts',
  vaultPath: resolvedPath,
})
const [pendingThoughtJump, setPendingThoughtJump] = useState<ThoughtRecord | null>(null)
```

Use a broader enabled condition if editor pins need thoughts for the active note while not in the Thoughts collection:

```ts
enabled: Boolean(resolvedPath && (notes.activeTabPath || (effectiveSelection.kind === 'filter' && effectiveSelection.filter === 'thoughts')))
```

Add:

```ts
const handleOpenThought = useCallback(async (thought: ThoughtRecord) => {
  const entry = vault.entries.find((entry) => entry.path === thought.notePath)
  if (!entry) {
    setToastMessage('Thought source note could not be found.')
    return
  }
  await notes.handleReplaceActiveTab(entry)
  setPendingThoughtJump(thought)
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent<ThoughtJumpEventDetail>(THOUGHT_JUMP_EVENT, {
      detail: { thought },
    }))
  })
}, [notes, vault.entries])
```

Pass to `Sidebar`:

```tsx
thoughtCount={thoughtsIndex.thoughts.length}
```

Pass to `NoteList`:

```tsx
thoughtGroups={thoughtsIndex.groups}
thoughtLoading={thoughtsIndex.loading}
thoughtError={thoughtsIndex.error}
onOpenThought={handleOpenThought}
```

Pass to `Editor`:

```tsx
thoughts={thoughtsIndex.thoughts}
onSaveThought={thoughtsIndex.saveThought}
onDeleteThought={thoughtsIndex.deleteThought}
pendingThoughtJump={pendingThoughtJump}
onThoughtJumpHandled={(thoughtId) => {
  setPendingThoughtJump((current) => current?.id === thoughtId ? null : current)
}}
onThoughtError={setToastMessage}
```

- [ ] **Step 9: Add styles**

Append to `src/App.css`:

```css
.tolaria-thought-pins {
  position: absolute;
  left: max(8px, calc(50% - var(--editor-max-width, 760px) / 2 - 36px));
  top: 72px;
  z-index: 25;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.tolaria-thought-pin {
  pointer-events: auto;
  height: 28px;
  width: 28px;
  color: var(--text-muted);
  background: var(--bg-card);
  border: 1px solid var(--border);
  box-shadow: 0 1px 4px var(--shadow-dialog);
}

.tolaria-thought-pin:hover {
  color: var(--primary);
  background: var(--bg-hover);
}

.tolaria-thought-pulse {
  outline: 2px solid var(--primary);
  outline-offset: 4px;
  border-radius: 4px;
  transition: outline-color 0.2s ease;
}
```

- [ ] **Step 10: Run focused editor tests**

Run:

```bash
pnpm vitest run src/components/thoughts/ThoughtPinsLayer.test.tsx src/components/tolariaEditorFormatting.behavior.test.tsx src/components/Editor.test.tsx src/App.test.tsx
```

Expected: tests pass.

- [ ] **Step 11: Commit editor integration**

Run:

```bash
git add src/components/thoughts/ThoughtPopover.tsx src/components/thoughts/ThoughtPinsLayer.tsx src/components/thoughts/ThoughtPinsLayer.test.tsx src/components/tolariaEditorFormatting.tsx src/components/tolariaEditorFormatting.behavior.test.tsx src/components/SingleEditorView.tsx src/components/Editor.tsx src/components/EditorContent.tsx src/components/editor-content/useEditorContentModel.ts src/components/editor-content/EditorContentLayout.tsx src/App.tsx src/App.css
git commit -m "Let readers attach thoughts from the editor" -m "Thoughts need to be created from selected passages or whole articles, then reopened from subtle pins or sidebar rows without changing article Markdown." -m "Constraint: Use existing BlockNote toolbar and shadcn controls rather than browser-default form UI" -m "Rejected: Persistent yellow highlighting for thoughts | the spec keeps thoughts visually separate from highlights" -m "Confidence: medium" -m "Scope-risk: broad" -m "Tested: pnpm vitest run src/components/thoughts/ThoughtPinsLayer.test.tsx src/components/tolariaEditorFormatting.behavior.test.tsx src/components/Editor.test.tsx src/App.test.tsx"
```

## Task 6: Smoke Test, Docs, And Full Verification

**Files:**
- Create: `tests/smoke/thoughts.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ABSTRACTIONS.md`

- [ ] **Step 1: Add smoke test**

Create `tests/smoke/thoughts.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { openDemoVault, resetDemoVault } from './helpers'

test('article thoughts persist, list, filter, open, and delete @smoke', async ({ page }) => {
  await resetDemoVault(page)
  await openDemoVault(page)

  await page.getByText('The Context and the Harness').click()
  await page.getByText('Retrieved documents are where context engineering intersects').first().dblclick()
  await page.getByTestId('add-thought').click()
  await page.getByLabel('Thought').fill('Retrieval quality is the main point here.')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByRole('button', { name: 'Open thought' }).first()).toBeVisible()
  await page.reload()

  await page.getByTestId('sidebar-top-nav').getByText('Thoughts', { exact: true }).click()
  await page.getByPlaceholder('Filter thoughts').fill('retrieval quality')
  await page.getByRole('button', { name: /Retrieval quality is the main point/ }).click()

  await expect(page.getByLabel('Thought')).toHaveValue('Retrieval quality is the main point here.')
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByTestId('sidebar-top-nav').getByText('Thoughts', { exact: true }).click()
  await expect(page.getByText('No thoughts yet')).toBeVisible()
})
```

Before creating the smoke test, inspect `tests/smoke/highlights.spec.ts` and use the same vault setup imports and calls in `tests/smoke/thoughts.spec.ts`.

- [ ] **Step 2: Update docs**

Add a short section to `docs/ARCHITECTURE.md`:

```markdown
### Article Thoughts

Thoughts are personal annotation records stored under `.tolaria/thoughts/` inside the selected vault. The Rust side owns vault-bounded sidecar reads and writes; the React side owns validation, grouping, filtering, and best-effort anchor matching. Source Markdown is not modified when a thought is created, edited, or deleted.
```

Add a short entry to `docs/ABSTRACTIONS.md`:

```markdown
### `useThoughtsIndex`

`useThoughtsIndex` lazily loads sidecar-backed `ThoughtRecord` objects, groups them by source note, and exposes create/update/delete actions. Editor surfaces use the same records to render margin pins and jump back to anchored passages.
```

- [ ] **Step 3: Run smoke test**

Run:

```bash
pnpm dev --port 5201 &
BASE_URL="http://localhost:5201" npx playwright test tests/smoke/thoughts.spec.ts
```

Expected: the smoke test passes. Stop the dev server after the test if it is still running.

- [ ] **Step 4: Run standard verification**

Run:

```bash
pnpm lint
npx tsc --noEmit
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Expected: all commands pass.

- [ ] **Step 5: Run coverage gates before final push**

Run:

```bash
pnpm test:coverage
cargo llvm-cov --manifest-path src-tauri/Cargo.toml --no-clean --fail-under-lines 85
```

Expected: coverage gates pass. If they fail because new code lacks coverage, add targeted tests before continuing.

- [ ] **Step 6: Check demo vault hygiene**

Run:

```bash
git status --short -- demo-vault demo-vault-v2
```

Expected: no output unless the smoke test intentionally updates tracked fixtures. Clean disposable smoke artifacts before final completion.

- [ ] **Step 7: Commit smoke test and docs**

Run:

```bash
git add tests/smoke/thoughts.spec.ts docs/ARCHITECTURE.md docs/ABSTRACTIONS.md
git commit -m "Verify article thoughts end to end" -m "The feature touches persistence, editor UI, and sidebar navigation, so a smoke test and architecture notes make the behavior easier to preserve during future upstream merges." -m "Constraint: Smoke coverage must protect the core create-persist-open-delete workflow" -m "Rejected: Unit-only verification | the feature depends on cross-surface app wiring" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: BASE_URL=http://localhost:5201 npx playwright test tests/smoke/thoughts.spec.ts; pnpm lint; npx tsc --noEmit; pnpm test; cargo test --manifest-path src-tauri/Cargo.toml"
```

## Final Verification Checklist

- [ ] `git status --short` shows only intentional files or known unrelated runtime state.
- [ ] `pnpm lint` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm test` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `BASE_URL="http://localhost:5201" npx playwright test tests/smoke/thoughts.spec.ts` passes.
- [ ] `git status --short -- demo-vault demo-vault-v2` is empty.
- [ ] Manual app check: create a selected-passage thought, reload, open Thoughts, filter it, open it, edit it, delete it.
- [ ] File-level CodeScene checks pass for all touched code files, or CodeScene is explicitly unavailable.

## Self-Review Notes

- Spec coverage: The plan covers selected-text thoughts, whole-article thoughts, sidecar persistence, margin pins, Thoughts sidebar collection, search by body/quote/title, open-and-jump, edit, delete, error handling, and smoke coverage.
- Placeholder scan: This plan contains concrete files, commands, expected outcomes, and code snippets, with no deferred implementation markers or unspecified test instructions.
- Type consistency: `ThoughtRecord`, `ThoughtAnchor`, `ThoughtGroup`, `ThoughtJumpEventDetail`, `useThoughtsIndex`, `ThoughtsList`, `ThoughtPopover`, and `ThoughtPinsLayer` are named consistently across tasks.
