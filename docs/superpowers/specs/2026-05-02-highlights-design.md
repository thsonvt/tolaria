# Persistent Markdown Highlights Design

## Summary

Tolaria will let readers highlight text in Markdown notes and return to those highlights later. Highlights are stored directly in the note body using Markdown highlight syntax, `==highlighted text==`, so they persist across reloads and remain portable outside Tolaria.

The sidebar will gain a first-class **Highlights** collection. Selecting it shows all highlights across all notes in the note-list pane, grouped by note, with a lightweight text filter. Clicking a highlight opens the source note, scrolls to the matching highlighted passage, and briefly pulses it.

## Goals

- Let users highlight selected article text while reading.
- Persist highlights in the Markdown file itself.
- Re-render highlights after reopening or reloading the same note.
- Provide a sidebar section for browsing all highlights across the vault.
- Support a filter over note titles and highlighted excerpts.
- Keep the v1 storage format simple while leaving room for future color/category support.

## Non-Goals

- No highlight database, sidecar file, or app-owned highlight store in v1.
- No multiple highlight colors/categories in v1.
- No comments, tags, reactions, or annotation threads attached to highlights.
- No exact durable highlight IDs embedded into Markdown.
- No attempt to make duplicate excerpt navigation perfect in v1.

## User Experience

### Creating And Removing Highlights

Highlighting behaves like normal inline formatting:

1. The user selects text in the editor.
2. The floating formatting toolbar shows a Highlight button.
3. `Cmd+Shift+H` toggles the same action.
4. Applying the action wraps the selected text with `==`.
5. Running the action while the cursor is inside an existing highlight removes the surrounding `==`.

The toolbar button should use a highlight/marker-style icon and fit the existing Tolaria formatting toolbar. It should not introduce a large popover or color picker in v1.

### Reading Highlights

When a note is loaded, any `==highlighted text==` spans render with a yellow highlight style in the BlockNote editor.

Raw Markdown remains the authority. If a user types `==important passage==` in raw mode, Tolaria should render it as a highlight after reload/save and include it in the Highlights collection.

### Highlights Collection

The sidebar gets a first-class **Highlights** row near the top-level filters. Selecting it changes the note-list pane into a grouped highlights view:

- Header: `Highlights`
- Filter input: searches note titles and highlighted text
- Groups: one compact note header per note
- Rows: each highlighted excerpt under its source note

Clicking a row opens the note, scrolls to the matching highlight, and briefly pulses the highlight so the user can orient themselves.

## Data Model

Highlights are stored only in Markdown:

```markdown
The prompt is only one part of the system. ==The system instructions, retrieved documents, tool definitions, conversation history, and memory all matter.==
```

The frontend derives highlight records at runtime:

```ts
type HighlightExcerpt = {
  id: string
  notePath: string
  noteTitle: string
  excerpt: string
  startOffset: number
  endOffset: number
}
```

`id` is deterministic and derived from note path, offset, and excerpt hash. It is not persisted. If note text changes, highlight records are re-derived from the Markdown source.

This keeps the vault portable and avoids a second source of truth. The tradeoff is that duplicate identical highlights in the same note may not be distinguishable for jump targeting in v1.

## Architecture

### Markdown Utilities

Add a focused Markdown utility module, `src/utils/highlightMarkdown.ts`, responsible for:

- Parsing `==...==` spans from Markdown text.
- Ignoring empty spans.
- Avoiding nested highlight output such as `====text====`.
- Producing normalized excerpts for list display.
- Supporting toggle behavior for single-block text selections and cursor-inside-highlight removal.

The utility should be unit-tested independently from BlockNote.

### Editor Integration

Tolaria’s existing editor formatting surface already hides controls that do not survive Markdown round-trip. Highlight should be added only if it round-trips through Tolaria’s Markdown save/load path.

Integration points:

- Add a Highlight button to the app-owned floating formatting toolbar.
- Add `Cmd+Shift+H` as a keyboard shortcut while editing.
- Toggle `==...==` around selected text.
- If the cursor is inside an existing highlight and there is no selection, remove that highlight.
- Render `==...==` spans with the app’s yellow highlight style.

V1 supports a single text selection within one paragraph/block. Multi-block selection is out of scope until BlockNote and Markdown conversion behavior is verified separately.

### Highlights Index

Add a hook, `useHighlightsIndex`, that derives highlights across vault notes.

The hook should:

- Use loaded `VaultEntry` metadata for note title and ordering.
- Read note content on demand for notes not already open.
- Recompute when vault entries reload or a note is saved.
- Keep the index reconstructible from Markdown content.

The first implementation can build the index lazily when the Highlights collection is opened. That avoids adding background work to normal startup and stays compatible with future upstream changes.

### Sidebar And Note-List View

Extend sidebar selection with a highlights collection target. The note-list pane should branch to a `HighlightsList` view when that selection is active.

`HighlightsList` owns:

- Filter input.
- Grouping by note.
- Highlight excerpt rows.
- Empty states for no highlights and no filter matches.
- Row activation that opens the note and requests jump/pulse behavior.

This should reuse existing note-list visual density and shadcn/ui inputs/buttons rather than introducing a new panel style.

### Jump And Pulse

Jump-to-highlight is best-effort in v1:

1. Open the note.
2. Search the rendered editor content for the highlighted excerpt.
3. Scroll the first matching highlighted span into view.
4. Apply a short pulse class, then remove it.

If the excerpt no longer exists, Tolaria should open the note, skip the pulse, and show a non-blocking toast that the highlight could not be located.

## Error Handling And Edge Cases

- Empty selection outside a highlight: no-op.
- Cursor inside highlight with no selection: remove that highlight.
- Multi-paragraph selection: no-op in v1.
- Nested highlights: normalize to one highlight span.
- Overlapping highlights: do not create overlapping syntax.
- Duplicate highlighted excerpts in one note: jump to the first matching rendered highlight.
- Broken or malformed highlight syntax: preserve Markdown text; parse only balanced `==...==` spans.
- Raw editor edits: manual `==...==` should be discovered after save/reload.

## Testing

### Unit Tests

- Parse one highlight.
- Parse multiple highlights in one note.
- Ignore empty highlights.
- Avoid nested highlight output.
- Derive deterministic highlight IDs.
- Filter highlights by note title and excerpt text.

### Editor Tests

- Toolbar action wraps selected text with `==`.
- Shortcut wraps selected text with `==`.
- Toggle inside an existing highlight removes `==`.
- Highlight survives save/load through Markdown.
- Manually typed raw `==...==` appears as a rendered highlight.

### Sidebar/List Tests

- Sidebar shows the Highlights row.
- Selecting Highlights renders grouped excerpts.
- Filter input narrows by note title and excerpt text.
- Empty states are shown for no highlights and no filter matches.
- Clicking an excerpt opens its source note and requests jump/pulse.

### Smoke Test

Add a focused Playwright smoke test:

1. Open a demo vault note.
2. Select text in one paragraph.
3. Apply Highlight from toolbar or `Cmd+Shift+H`.
4. Save/reload the note.
5. Verify the highlight still renders.
6. Open the sidebar Highlights collection.
7. Filter for part of the highlighted text.
8. Click the excerpt and verify the source note opens and the highlight is visible.

## Future Extensions

The v1 storage format is intentionally plain yellow `==text==`. Future color/category support should preserve compatibility with existing highlights. Possible extensions include:

- App-specific Markdown attributes after the highlighted text.
- Optional frontmatter rules for highlight categories.
- A sidecar cache for faster browsing that remains reconstructible from Markdown.

Any future extension must keep existing `==text==` highlights readable and editable without migration.
