# Article Thoughts Design

## Summary

Tolaria will add **Thoughts** as a personal annotation layer for articles and notes. A thought is a short Markdown-lite comment written by the reader, either anchored to selected article text or attached to the whole source note.

Thoughts are separate from Highlights. Highlights mark text as important and are stored inline as `==highlighted text==`. Thoughts capture the reader's own interpretation, question, or reaction and are stored in a Tolaria-managed sidecar so imported article Markdown stays clean.

## Goals

- Let users write a thought on selected text while reading an article.
- Let users write a whole-article thought when no text is selected.
- Persist thoughts across app reloads without changing the source article Markdown.
- Show anchored thoughts as subtle margin pins beside the relevant passage.
- Provide a top-level **Thoughts** sidebar collection for browsing all thoughts across notes.
- Search thoughts by thought text, quoted passage, and source note title.
- Let users view, edit, and delete saved thoughts.
- Open the source note from a thought and jump to the anchored passage when possible.

## Non-Goals

- No multi-message discussion threads in v1.
- No collaborative comments, mentions, reactions, or resolved/unresolved workflow in v1.
- No automatic yellow highlight creation when saving a thought.
- No full BlockNote editor inside the thought popover.
- No sync conflict UI beyond normal Git/file conflict behavior.
- No guaranteed anchor stability after major article rewrites.

## User Experience

### Creating A Passage Thought

When the user selects text in the editor, the formatting toolbar includes an **Add thought** action. Activating it opens a compact popover near the selection.

The popover contains:

- The selected quote, shown read-only and truncated if long.
- A Markdown-lite text field for the thought body.
- `Save` and `Cancel` actions.

Saving creates a passage thought. The selected article text does not become a yellow highlight. Instead, Tolaria renders a subtle margin pin aligned near the anchored passage. The passage may receive a temporary orientation style while the popover is open or after jumping from the collection, but the persistent visual marker is the margin pin.

### Creating A Whole-Article Thought

When there is no selected text, the user can create a whole-article thought from an editor command or toolbar/menu action. The same popover opens without a quote.

Whole-article thoughts are attached to the source note rather than a passage. Opening one from the Thoughts collection opens the source note near the top.

### Viewing, Editing, And Deleting

Clicking a margin pin opens the thought popover in view/edit mode. The user can change the Markdown-lite body, save changes, cancel, or delete the thought.

Deletion removes the thought record and the margin pin. It does not alter the article Markdown.

### Thoughts Collection

The left sidebar gets a top-level **Thoughts** collection, parallel to **Highlights**.

Selecting **Thoughts** changes the note-list pane into a grouped thoughts view:

- Header: `Thoughts`
- Filter input: searches thought text, quoted passage, and source note title
- Groups: source note title
- Rows: thought excerpt, optional quoted passage, modified timestamp
- Empty states: no thoughts yet, no matching thoughts, and load error

Clicking a row opens the source note. Passage thoughts best-effort jump to the anchored passage and pulse the margin pin. Whole-article thoughts open the note at the top.

## Storage

Thoughts are stored in a Tolaria-managed sidecar under the vault, not inline in article Markdown. The preferred location is:

```text
.tolaria/thoughts/
```

The implementation can choose either one JSON file per source note or a small index plus per-note files, but the storage contract must keep source Markdown unchanged.

Each thought record includes:

```ts
interface ThoughtRecord {
  id: string
  notePath: string
  noteTitle: string
  anchor: ThoughtAnchor
  bodyMarkdown: string
  createdAt: string
  updatedAt: string
}

type ThoughtAnchor =
  | {
      type: 'selection'
      quote: string
      prefix: string
      suffix: string
      startOffset: number
      endOffset: number
    }
  | {
      type: 'article'
    }
```

`id` is app-owned and persisted because thoughts are user-authored records. This differs from highlight IDs, which are derived at runtime from Markdown content.

## Markdown-Lite Body

Thought bodies support Markdown-lite:

- Paragraphs
- Bold and italic
- Inline code
- Links
- Wikilinks when supported by existing markdown rendering

The popover does not embed the full rich note editor in v1. A simple text area is sufficient, with rendered preview reserved for a future enhancement unless an existing lightweight Markdown preview can be reused safely.

## Anchor Matching

Passage anchors are best-effort. Tolaria stores the selected quote, surrounding prefix/suffix context, and initial offsets. On reload or jump:

1. Try the stored offsets if the quote still matches there.
2. Search the note body for the exact quote.
3. If there are multiple matches, prefer the one whose surrounding context best matches the stored prefix/suffix.
4. If no match is found, keep the thought in the collection and open the source note without a pin jump.

When an anchor cannot be found, Tolaria shows a non-blocking toast such as `Thought anchor could not be found in this note.`

## Architecture

### Thought Utilities

Add a focused utility module for pure data operations:

- Validate and normalize thought records.
- Build deterministic sidecar paths from vault path and note path.
- Group thoughts by source note.
- Filter thoughts by body, quote, and source title.
- Match anchors against Markdown text.

### Thought Index Hook

Add a hook similar in shape to `useHighlightsIndex`, but backed by sidecar files:

- Load thoughts lazily when the **Thoughts** collection is opened.
- Include open-tab content for anchor matching when available.
- Expose grouped thoughts, flat thoughts, loading, and error state.
- Support refresh after create/edit/delete.

### Editor Integration

Editor integration owns:

- Detecting selected text for passage thoughts.
- Opening the thought popover for selected text or article-level creation.
- Rendering margin pins for thoughts whose anchors match the current note.
- Handling pin click, jump, pulse, edit, and delete.

### Sidebar And Note List

Extend sidebar selection with a `thoughts` filter. The note-list pane branches to a `ThoughtsList` view when selected.

`ThoughtsList` owns:

- Filter input.
- Grouped rows.
- Loading/error/empty states.
- Row activation callback.

## Error Handling

- Invalid sidecar JSON: show load error in Thoughts collection and leave source notes editable.
- Missing source note: keep the thought visible but show a missing-source state; clicking shows a toast.
- Missing anchor: open source note and show a non-blocking toast.
- Save failure: keep the popover open and show the error without losing typed text.
- Delete failure: leave the thought visible and show the error.

## Testing

### Unit Tests

- Validate thought records and reject malformed sidecar content.
- Build sidecar paths safely inside `.tolaria/thoughts/`.
- Group thoughts by source note.
- Filter by thought text, quote, and source title.
- Match anchors by offset, exact quote, and quote plus context.
- Return no match when the quote no longer exists.

### Component And Hook Tests

- Create a selected-text thought from the editor.
- Create a whole-article thought when no selection exists.
- Render margin pins for matched passage thoughts.
- Open, edit, and delete a thought from a pin.
- Render the Thoughts collection grouped by source note.
- Filter the Thoughts collection by body, quote, and title.
- Open a thought row and jump/pulse the matching pin.
- Handle missing anchor and missing source states.

### Smoke Test

Add a smoke test that:

1. Opens a disposable demo vault copy.
2. Opens an article.
3. Selects a stable passage and saves a thought.
4. Reloads the app.
5. Opens the **Thoughts** collection.
6. Filters for text from the thought.
7. Clicks the result.
8. Verifies the source article opens and the margin pin is visible.

## Future Extensions

- Multiple thoughts per passage as threads.
- Per-note thought indicators in the note list or sidebar.
- Rich Markdown preview in the popover.
- Backlinks from thoughts into generated evergreen notes.
- Export thoughts to standalone Markdown notes.
- Optional conversion from a thought into a full note.
