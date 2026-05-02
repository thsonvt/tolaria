# Persistent Markdown Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build persistent reader highlights stored as inline Markdown `==text==`, plus a sidebar Highlights collection that lists and opens highlights across notes.

**Architecture:** Raw Markdown remains the only source of truth. A focused highlight Markdown utility parses, normalizes, indexes, injects, and restores highlight spans; BlockNote receives a custom boolean style named `highlight` so toolbar and shortcut toggles use the editor's existing formatting path. The sidebar selects a top-level `highlights` filter and the note-list pane branches to a grouped highlights view that lazily reads note content and emits jump requests.

**Tech Stack:** React, TypeScript, Vitest, BlockNote custom style specs, Tauri `invoke('get_note_content')`, shadcn/ui `Input`, Phosphor/Lucide icons, Playwright smoke tests.

---

## Source Spec

- `docs/superpowers/specs/2026-05-02-highlights-design.md`

## File Map

- Create `src/utils/highlightMarkdown.ts`: parse `==...==`, normalize excerpts, deterministic IDs, filter helpers, BlockNote block restore/injection helpers, and DOM jump event constants.
- Create `src/utils/highlightMarkdown.test.ts`: unit coverage for parser/index/filter/round-trip block helpers.
- Modify `src/components/editorSchema.tsx`: register a custom `highlight` boolean style in the app BlockNote schema.
- Modify `src/components/tolariaEditorFormatting.tsx`: add a Highlight formatting toolbar button that calls `editor.toggleStyles({ highlight: true })`.
- Modify `src/components/tolariaEditorFormatting.behavior.test.tsx`: assert the highlight button appears only when style/schema/selection support it and toggles the style.
- Modify `src/components/SingleEditorView.tsx`: add `Cmd+Shift+H` editor shortcut and listen for highlight jump requests.
- Modify `src/hooks/useEditorTabSwap.ts`: preprocess Markdown highlights before parse, inject highlight styled text after parse, and restore highlights before save.
- Modify `src/components/editorRawModeSync.ts`: restore highlights when syncing editor content into raw mode.
- Modify `src/types.ts`: add `highlights` to `SidebarFilter`.
- Modify `src/components/sidebar/SidebarTopNav.tsx`: add first-class Highlights row and count.
- Modify `src/components/Sidebar.tsx`: compute and pass highlight count to `SidebarTopNav`.
- Modify `src/components/sidebar/SidebarTopNav.test.tsx` or `src/components/Sidebar.test.tsx`: cover the Highlights row.
- Create `src/hooks/useHighlightsIndex.ts`: lazy cross-note highlight index built from Markdown content.
- Create `src/hooks/useHighlightsIndex.test.tsx`: mock Tauri reads and verify grouping/filter refresh behavior.
- Create `src/components/note-list/HighlightsList.tsx`: grouped highlights list with filter input, empty states, and row activation.
- Create `src/components/note-list/HighlightsList.test.tsx`: render, filter, empty-state, and click coverage.
- Modify `src/components/note-list/useNoteListModel.tsx`: build highlights model when selection is `{ kind: 'filter', filter: 'highlights' }`.
- Modify `src/components/note-list/NoteListLayout.tsx`: branch to `HighlightsList`.
- Modify `src/components/note-list/noteListUtils.ts`: title `Highlights`.
- Modify `src/utils/noteListHelpers.ts`: return an empty note entry list for `highlights` so normal note filtering does not accidentally render all notes.
- Modify `src/App.tsx`: handle highlight row activation by opening the note and dispatching a jump request after the editor loads.
- Modify `src/App.css`: add yellow highlight and pulse styles.
- Modify `docs/ARCHITECTURE.md` and `docs/ABSTRACTIONS.md`: document Markdown-owned highlights and the derived index hook.
- Create `tests/smoke/highlights.spec.ts`: core smoke test for highlight create, persist, sidebar list, filter, and jump.

## Commit Plan

- Commit 1: Markdown parser/index primitives.
- Commit 2: Editor rendering, save/load, toolbar, and shortcut.
- Commit 3: Sidebar Highlights collection and list view.
- Commit 4: Jump/pulse, smoke test, and docs.

Use Lore-style commit messages per `AGENTS.md`. Do not use `--no-verify`.

## Task 0: Baseline And Code Health

**Files:**
- Read only: `.codescene-thresholds`
- Read only: `docs/superpowers/specs/2026-05-02-highlights-design.md`
- Read only: `docs/adr/`

- [ ] **Step 1: Check repository state**

Run:

```bash
git status --short
```

Expected: note any unrelated dirty files. Do not revert unrelated user or generated files.

- [ ] **Step 2: Check current branch**

Run:

```bash
git branch --show-current
```

Expected:

```text
main
```

- [ ] **Step 3: Read architecture decision context**

Run:

```bash
ls docs/adr && sed -n '1,220p' docs/ARCHITECTURE.md && sed -n '1,220p' docs/ABSTRACTIONS.md
```

Expected: no ADR requires a sidecar store for annotations; the plan keeps highlights reconstructible from Markdown.

- [ ] **Step 4: Run CodeScene project health if available**

Run:

```bash
omx explore --prompt "Report the current CodeScene health gate status for this repository if available; otherwise say unavailable."
```

Expected: either a health report at or above thresholds or an explicit unavailable result. If unavailable, continue and run file-level checks before commits.

## Task 1: Markdown Highlight Utilities

**Files:**
- Create: `src/utils/highlightMarkdown.ts`
- Create: `src/utils/highlightMarkdown.test.ts`

- [ ] **Step 1: Write failing parser and filter tests**

Create `src/utils/highlightMarkdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  HIGHLIGHT_STYLE_KEY,
  buildHighlightGroups,
  filterHighlightGroups,
  parseMarkdownHighlights,
  restoreHighlightsInBlocks,
} from './highlightMarkdown'

const note = {
  notePath: '/vault/Harness Engineering/agent.md',
  noteTitle: 'Harnessing the harness',
}

describe('parseMarkdownHighlights', () => {
  it('parses one highlight with deterministic metadata', () => {
    const highlights = parseMarkdownHighlights({
      markdown: 'Alpha ==the system prompt is only one input== omega.',
      ...note,
    })

    expect(highlights).toHaveLength(1)
    expect(highlights[0]).toMatchObject({
      notePath: note.notePath,
      noteTitle: note.noteTitle,
      excerpt: 'the system prompt is only one input',
      startOffset: 6,
      endOffset: 45,
    })
    expect(highlights[0].id).toBe('/vault/Harness Engineering/agent.md:6:45:0bf82657')
  })

  it('parses multiple non-empty highlights and ignores empty spans', () => {
    const highlights = parseMarkdownHighlights({
      markdown: '==first== and ==== and ==second passage==',
      ...note,
    })

    expect(highlights.map((highlight) => highlight.excerpt)).toEqual([
      'first',
      'second passage',
    ])
  })

  it('does not emit nested highlight output for four equals around text', () => {
    const highlights = parseMarkdownHighlights({
      markdown: 'Prefix ====text==== suffix',
      ...note,
    })

    expect(highlights).toEqual([])
  })

  it('keeps malformed unbalanced syntax as plain text', () => {
    const highlights = parseMarkdownHighlights({
      markdown: 'Prefix ==open only suffix',
      ...note,
    })

    expect(highlights).toEqual([])
  })
})

describe('highlight groups', () => {
  it('groups highlights by note in entry order', () => {
    const groups = buildHighlightGroups([
      {
        id: 'b',
        notePath: '/vault/b.md',
        noteTitle: 'Beta',
        excerpt: 'second',
        startOffset: 0,
        endOffset: 10,
      },
      {
        id: 'a',
        notePath: '/vault/a.md',
        noteTitle: 'Alpha',
        excerpt: 'first',
        startOffset: 0,
        endOffset: 9,
      },
    ], ['/vault/a.md', '/vault/b.md'])

    expect(groups.map((group) => group.notePath)).toEqual(['/vault/a.md', '/vault/b.md'])
  })

  it('filters by note title and excerpt', () => {
    const groups = buildHighlightGroups([
      {
        id: 'a',
        notePath: '/vault/a.md',
        noteTitle: 'Harnessing the harness',
        excerpt: 'retrieval is infrastructure',
        startOffset: 0,
        endOffset: 29,
      },
    ], ['/vault/a.md'])

    expect(filterHighlightGroups(groups, 'harness')).toHaveLength(1)
    expect(filterHighlightGroups(groups, 'retrieval')[0].highlights).toHaveLength(1)
    expect(filterHighlightGroups(groups, 'missing')).toEqual([])
  })
})

describe('restoreHighlightsInBlocks', () => {
  it('serializes highlighted styled text back to markdown syntax', () => {
    const restored = restoreHighlightsInBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Keep ', styles: {} },
          { type: 'text', text: 'this passage', styles: { [HIGHLIGHT_STYLE_KEY]: true } },
        ],
        children: [],
      },
    ])

    expect(restored[0].content).toEqual([
      { type: 'text', text: 'Keep ', styles: {} },
      { type: 'text', text: '==this passage==', styles: {} },
    ])
  })
})
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```bash
pnpm vitest run src/utils/highlightMarkdown.test.ts
```

Expected: fail because `src/utils/highlightMarkdown.ts` does not exist.

- [ ] **Step 3: Implement highlight utility**

Create `src/utils/highlightMarkdown.ts`:

```ts
import type { VaultEntry } from '../types'

export const HIGHLIGHT_STYLE_KEY = 'highlight' as const
export const HIGHLIGHT_JUMP_EVENT = 'tolaria:highlight-jump' as const
export const HIGHLIGHT_PULSE_CLASS = 'tolaria-highlight-pulse' as const

export interface HighlightExcerpt {
  id: string
  notePath: string
  noteTitle: string
  excerpt: string
  startOffset: number
  endOffset: number
}

export interface HighlightGroup {
  notePath: string
  noteTitle: string
  highlights: HighlightExcerpt[]
}

type InlineText = {
  type: 'text'
  text: string
  styles?: Record<string, boolean | string>
}

type EditorBlock = {
  content?: Array<InlineText | Record<string, unknown>>
  children?: EditorBlock[]
  [key: string]: unknown
}

function hashExcerpt(excerpt: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < excerpt.length; index += 1) {
    hash ^= excerpt.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function isBoundaryEquals(markdown: string, index: number): boolean {
  return markdown[index] === '='
    && markdown[index + 1] === '='
    && markdown[index - 1] !== '='
    && markdown[index + 2] !== '='
}

function normalizeExcerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function buildHighlightId(notePath: string, startOffset: number, endOffset: number, excerpt: string): string {
  return `${notePath}:${startOffset}:${endOffset}:${hashExcerpt(excerpt)}`
}

export function parseMarkdownHighlights(options: {
  markdown: string
  notePath: string
  noteTitle: string
}): HighlightExcerpt[] {
  const { markdown, notePath, noteTitle } = options
  const highlights: HighlightExcerpt[] = []
  let index = 0

  while (index < markdown.length - 1) {
    if (!isBoundaryEquals(markdown, index)) {
      index += 1
      continue
    }

    const openOffset = index
    const contentStart = index + 2
    let closeOffset = -1
    index = contentStart

    while (index < markdown.length - 1) {
      if (isBoundaryEquals(markdown, index)) {
        closeOffset = index
        break
      }
      index += 1
    }

    if (closeOffset === -1) break

    const excerpt = normalizeExcerpt(markdown.slice(contentStart, closeOffset))
    if (excerpt.length > 0) {
      const endOffset = closeOffset + 2
      highlights.push({
        id: buildHighlightId(notePath, openOffset, endOffset, excerpt),
        notePath,
        noteTitle,
        excerpt,
        startOffset: openOffset,
        endOffset,
      })
    }

    index = closeOffset + 2
  }

  return highlights
}

export function parseEntryHighlights(entry: VaultEntry, markdown: string): HighlightExcerpt[] {
  return parseMarkdownHighlights({
    markdown,
    notePath: entry.path,
    noteTitle: entry.title,
  })
}

export function buildHighlightGroups(
  highlights: HighlightExcerpt[],
  orderedNotePaths: string[],
): HighlightGroup[] {
  const order = new Map(orderedNotePaths.map((path, index) => [path, index]))
  const grouped = new Map<string, HighlightGroup>()

  for (const highlight of highlights) {
    const group = grouped.get(highlight.notePath) ?? {
      notePath: highlight.notePath,
      noteTitle: highlight.noteTitle,
      highlights: [],
    }
    group.highlights.push(highlight)
    grouped.set(highlight.notePath, group)
  }

  return Array.from(grouped.values()).sort((left, right) => {
    const leftOrder = order.get(left.notePath) ?? Number.MAX_SAFE_INTEGER
    const rightOrder = order.get(right.notePath) ?? Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return left.noteTitle.localeCompare(right.noteTitle)
  })
}

export function filterHighlightGroups(groups: HighlightGroup[], query: string): HighlightGroup[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return groups

  return groups
    .map((group) => {
      const titleMatches = group.noteTitle.toLowerCase().includes(normalizedQuery)
      const highlights = titleMatches
        ? group.highlights
        : group.highlights.filter((highlight) => (
          highlight.excerpt.toLowerCase().includes(normalizedQuery)
        ))
      return { ...group, highlights }
    })
    .filter((group) => group.highlights.length > 0)
}

function restoreHighlightText(inline: InlineText): InlineText {
  const styles = inline.styles ?? {}
  if (styles[HIGHLIGHT_STYLE_KEY] !== true) return inline

  const { [HIGHLIGHT_STYLE_KEY]: _highlight, ...restStyles } = styles
  return {
    ...inline,
    text: `==${inline.text}==`,
    styles: restStyles,
  }
}

export function restoreHighlightsInBlocks<T extends EditorBlock>(blocks: T[]): T[] {
  return blocks.map((block) => ({
    ...block,
    content: Array.isArray(block.content)
      ? block.content.map((inline) => (
        inline.type === 'text' && typeof inline.text === 'string'
          ? restoreHighlightText(inline as InlineText)
          : inline
      ))
      : block.content,
    children: Array.isArray(block.children)
      ? restoreHighlightsInBlocks(block.children)
      : block.children,
  }))
}
```

- [ ] **Step 4: Run parser tests**

Run:

```bash
pnpm vitest run src/utils/highlightMarkdown.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Markdown primitives**

Run:

```bash
git add src/utils/highlightMarkdown.ts src/utils/highlightMarkdown.test.ts
git commit -m "Make note highlights reconstructible from Markdown" -m "Highlights are stored as portable ==text== spans, so the derived index can be rebuilt without a sidecar database." -m "Constraint: V1 must keep raw Markdown as the only source of truth" -m "Rejected: Sidecar highlight store | adds merge and upstream compatibility risk" -m "Confidence: high" -m "Scope-risk: narrow" -m "Tested: pnpm vitest run src/utils/highlightMarkdown.test.ts"
```

Expected: commit succeeds without `--no-verify`.

## Task 2: Editor Highlight Rendering And Markdown Round Trip

**Files:**
- Modify: `src/utils/highlightMarkdown.ts`
- Modify: `src/utils/highlightMarkdown.test.ts`
- Modify: `src/components/editorSchema.tsx`
- Modify: `src/hooks/useEditorTabSwap.ts`
- Modify: `src/components/editorRawModeSync.ts`
- Modify: `src/App.css`

- [ ] **Step 1: Add failing block injection tests**

Modify the existing import from `./highlightMarkdown` in `src/utils/highlightMarkdown.test.ts`:

```ts
import {
  HIGHLIGHT_STYLE_KEY,
  buildHighlightGroups,
  filterHighlightGroups,
  injectHighlightsInBlocks,
  parseMarkdownHighlights,
  preProcessHighlightMarkdown,
  restoreHighlightsInBlocks,
} from './highlightMarkdown'
```

Append these tests to the same file:

```ts
describe('highlight Markdown preprocessing', () => {
  it('marks raw markdown spans with sentinel tokens before BlockNote parse', () => {
    expect(preProcessHighlightMarkdown('Keep ==this passage== safe')).toBe(
      'Keep TOLARIA_HIGHLIGHT_OPENthis passageTOLARIA_HIGHLIGHT_CLOSE safe',
    )
  })

  it('injects sentinel token text into styled BlockNote text', () => {
    const injected = injectHighlightsInBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Keep TOLARIA_HIGHLIGHT_OPENthis passageTOLARIA_HIGHLIGHT_CLOSE safe',
            styles: {},
          },
        ],
        children: [],
      },
    ])

    expect(injected[0].content).toEqual([
      { type: 'text', text: 'Keep ', styles: {} },
      { type: 'text', text: 'this passage', styles: { highlight: true } },
      { type: 'text', text: ' safe', styles: {} },
    ])
  })
})
```

- [ ] **Step 2: Run utility tests and verify failure**

Run:

```bash
pnpm vitest run src/utils/highlightMarkdown.test.ts
```

Expected: fail because `preProcessHighlightMarkdown` and `injectHighlightsInBlocks` are not exported.

- [ ] **Step 3: Extend utility with preprocess and injection helpers**

Modify `src/utils/highlightMarkdown.ts`:

```ts
const HIGHLIGHT_OPEN_TOKEN = 'TOLARIA_HIGHLIGHT_OPEN'
const HIGHLIGHT_CLOSE_TOKEN = 'TOLARIA_HIGHLIGHT_CLOSE'

export function preProcessHighlightMarkdown(markdown: string): string {
  let output = ''
  let index = 0

  while (index < markdown.length - 1) {
    if (!isBoundaryEquals(markdown, index)) {
      output += markdown[index]
      index += 1
      continue
    }

    const contentStart = index + 2
    let closeOffset = -1
    let scan = contentStart
    while (scan < markdown.length - 1) {
      if (isBoundaryEquals(markdown, scan)) {
        closeOffset = scan
        break
      }
      scan += 1
    }

    if (closeOffset === -1) {
      output += markdown.slice(index)
      return output
    }

    const content = markdown.slice(contentStart, closeOffset)
    const excerpt = normalizeExcerpt(content)
    if (excerpt.length === 0) {
      output += markdown.slice(index, closeOffset + 2)
    } else {
      output += `${HIGHLIGHT_OPEN_TOKEN}${content}${HIGHLIGHT_CLOSE_TOKEN}`
    }
    index = closeOffset + 2
  }

  return output + markdown.slice(index)
}

function splitHighlightTokens(text: string, styles: Record<string, boolean | string>): InlineText[] {
  const segments: InlineText[] = []
  let index = 0

  while (index < text.length) {
    const open = text.indexOf(HIGHLIGHT_OPEN_TOKEN, index)
    if (open === -1) {
      if (index < text.length) segments.push({ type: 'text', text: text.slice(index), styles })
      break
    }

    if (open > index) {
      segments.push({ type: 'text', text: text.slice(index, open), styles })
    }

    const contentStart = open + HIGHLIGHT_OPEN_TOKEN.length
    const close = text.indexOf(HIGHLIGHT_CLOSE_TOKEN, contentStart)
    if (close === -1) {
      segments.push({ type: 'text', text: text.slice(open), styles })
      break
    }

    const highlightedText = text.slice(contentStart, close)
    if (highlightedText.length > 0) {
      segments.push({
        type: 'text',
        text: highlightedText,
        styles: { ...styles, [HIGHLIGHT_STYLE_KEY]: true },
      })
    }
    index = close + HIGHLIGHT_CLOSE_TOKEN.length
  }

  return segments
}

export function injectHighlightsInBlocks<T extends EditorBlock>(blocks: T[]): T[] {
  return blocks.map((block) => ({
    ...block,
    content: Array.isArray(block.content)
      ? block.content.flatMap((inline) => (
        inline.type === 'text' && typeof inline.text === 'string'
          ? splitHighlightTokens(inline.text, (inline.styles ?? {}) as Record<string, boolean | string>)
          : [inline]
      ))
      : block.content,
    children: Array.isArray(block.children)
      ? injectHighlightsInBlocks(block.children)
      : block.children,
  }))
}
```

- [ ] **Step 4: Register the BlockNote highlight style**

Modify imports in `src/components/editorSchema.tsx`:

```ts
import {
  createCodeBlockSpec,
  BlockNoteSchema,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  createStyleSpec,
} from '@blocknote/core'
```

Add before `export const schema`:

```ts
const HighlightStyle = createStyleSpec(
  {
    type: 'highlight',
    propSchema: 'boolean',
  },
  {
    render: () => {
      const mark = document.createElement('mark')
      mark.className = 'tolaria-highlight'
      return {
        dom: mark,
        contentDOM: mark,
      }
    },
    toExternalHTML: () => {
      const mark = document.createElement('mark')
      mark.className = 'tolaria-highlight'
      return {
        dom: mark,
        contentDOM: mark,
      }
    },
    parse: (element) => (
      element instanceof HTMLElement && element.classList.contains('tolaria-highlight')
        ? true
        : undefined
    ),
  },
)
```

Modify `BlockNoteSchema.create`:

```ts
export const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    wikilink: WikiLink,
    mathInline: MathInline,
  },
  styleSpecs: {
    ...defaultStyleSpecs,
    highlight: HighlightStyle,
  },
}).extend({
  blockSpecs: {
    codeBlock,
    mathBlock,
    mermaidBlock,
  },
})
```

- [ ] **Step 5: Wire Markdown load/save pipeline**

Modify imports in `src/hooks/useEditorTabSwap.ts`:

```ts
import {
  injectHighlightsInBlocks,
  preProcessHighlightMarkdown,
  restoreHighlightsInBlocks,
} from '../utils/highlightMarkdown'
```

Modify `preProcessEditorMarkdown`:

```ts
function preProcessEditorMarkdown(markdown: string, vaultPath?: string): string {
  const withMermaid = preProcessMermaidMarkdown({ markdown })
  const withImages = vaultPath ? resolveImageUrls(withMermaid, vaultPath) : withMermaid
  const withWikilinks = preProcessWikilinks(withImages)
  const withHighlights = preProcessHighlightMarkdown(withWikilinks)
  return preProcessMathMarkdown({ markdown: withHighlights })
}
```

Modify `injectEditorMarkdownBlocks`:

```ts
function injectEditorMarkdownBlocks(blocks: EditorBlocks): EditorBlocks {
  const withWikilinks = injectWikilinks(blocks)
  const withHighlights = injectHighlightsInBlocks(withWikilinks)
  const withMath = injectMathInBlocks(withHighlights)
  return injectMermaidInBlocks(withMath) as EditorBlocks
}
```

Find the save serialization path in `useEditorTabSwap.ts` where `restoreWikilinksInBlocks` is called. Change that local restore chain to:

```ts
const restoredHighlights = restoreHighlightsInBlocks(editor.document)
const restored = restoreWikilinksInBlocks(restoredHighlights)
```

Modify `src/components/editorRawModeSync.ts` imports:

```ts
import { restoreHighlightsInBlocks } from '../utils/highlightMarkdown'
```

Modify `serializeEditorDocumentToMarkdown`:

```ts
export function serializeEditorDocumentToMarkdown(
  editor: ReturnType<typeof useCreateBlockNote>,
  tabContent: string,
  vaultPath?: string,
): string {
  const blocks = editor.document
  const restoredHighlights = restoreHighlightsInBlocks(blocks)
  const restored = restoreWikilinksInBlocks(restoredHighlights)
  const rawBodyMarkdown = compactMarkdown(serializeMermaidAwareBlocks(editor, restored))
  const bodyMarkdown = vaultPath ? portableImageUrls(rawBodyMarkdown, vaultPath) : rawBodyMarkdown
  const [frontmatter] = splitFrontmatter(tabContent)
  return `${frontmatter}${bodyMarkdown}`
}
```

- [ ] **Step 6: Add highlight styles**

Append to `src/App.css`:

```css
.tolaria-highlight {
  background: color-mix(in srgb, #facc15 38%, transparent);
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  padding: 0 1px;
}

.tolaria-highlight-pulse {
  animation: tolaria-highlight-pulse 1.35s ease-out 1;
}

@keyframes tolaria-highlight-pulse {
  0% {
    background: color-mix(in srgb, #facc15 78%, transparent);
    box-shadow: 0 0 0 0 color-mix(in srgb, #facc15 55%, transparent);
  }
  100% {
    background: color-mix(in srgb, #facc15 38%, transparent);
    box-shadow: 0 0 0 10px transparent;
  }
}
```

- [ ] **Step 7: Run editor utility tests**

Run:

```bash
pnpm vitest run src/utils/highlightMarkdown.test.ts src/components/editorRawModeSync.test.ts
```

Expected: pass. If `editorRawModeSync.test.ts` snapshots change, confirm the only new behavior is `highlight` styled text serializing to `==text==`.

## Task 3: Toolbar Button And Keyboard Shortcut

**Files:**
- Modify: `src/components/tolariaEditorFormatting.tsx`
- Modify: `src/components/tolariaEditorFormatting.behavior.test.tsx`
- Modify: `src/components/SingleEditorView.tsx`

- [ ] **Step 1: Write failing toolbar behavior test**

In `src/components/tolariaEditorFormatting.behavior.test.tsx`, add a test beside the existing bold/italic/code style tests:

```ts
it('shows highlight when the schema supports the persistent highlight style', () => {
  const editor = createMockEditor({
    schema: {
      styleSchema: {
        bold: { type: 'bold', propSchema: 'boolean' },
        code: { type: 'code', propSchema: 'boolean' },
        highlight: { type: 'highlight', propSchema: 'boolean' },
      },
    },
    activeStyles: {},
  })

  render(<TolariaFormattingToolbar editor={editor} />)

  fireEvent.click(screen.getByLabelText('Highlight'))
  expect(editor.toggleStyles).toHaveBeenCalledWith({ highlight: true })
})
```

- [ ] **Step 2: Run toolbar test and verify failure**

Run:

```bash
pnpm vitest run src/components/tolariaEditorFormatting.behavior.test.tsx
```

Expected: fail because the toolbar does not render a highlight button.

- [ ] **Step 3: Add highlight to the app-owned formatting toolbar**

Modify imports in `src/components/tolariaEditorFormatting.tsx`:

```ts
import {
  Bold,
  ChevronDown,
  Code2,
  Highlighter,
  Italic,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react'
```

Change the style union:

```ts
type TolariaBasicTextStyle = 'bold' | 'italic' | 'strike' | 'code' | 'highlight'
```

Add tooltip copy:

```ts
  highlight: {
    label: 'Highlight',
    mainTooltip: 'Highlight (persists in markdown)',
    secondaryTooltip: '==highlight==',
  },
```

Add icon:

```ts
  highlight: Highlighter,
```

Modify `replaceToolbarControls` so highlight appears after strike and before code:

```tsx
      case 'strikeStyleButton':
        return [
          <TolariaBasicTextStyleButton basicTextStyle="strike" key={item.key} />,
          <TolariaBasicTextStyleButton basicTextStyle="highlight" key="highlightStyleButton" />,
        ]
      case 'codeStyleButton':
        return [<TolariaBasicTextStyleButton basicTextStyle="code" key={item.key} />]
```

- [ ] **Step 4: Add keyboard shortcut**

In `src/components/SingleEditorView.tsx`, locate the root editor container that already handles editor keyboard events. Add this handler:

```ts
function isHighlightShortcut(event: KeyboardEvent | React.KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && event.shiftKey
    && event.key.toLowerCase() === 'h'
}
```

Inside the editor keydown handler:

```ts
if (isHighlightShortcut(event)) {
  event.preventDefault()
  editor.focus()
  editor.toggleStyles({ highlight: true } as never)
  return
}
```

If `SingleEditorView.tsx` does not have a single editor keydown hook, add a `useEffect` tied to `editor`:

```ts
useEffect(() => {
  const element = editor.domElement
  if (!element) return

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isHighlightShortcut(event)) return
    event.preventDefault()
    editor.focus()
    editor.toggleStyles({ highlight: true } as never)
  }

  element.addEventListener('keydown', handleKeyDown)
  return () => element.removeEventListener('keydown', handleKeyDown)
}, [editor])
```

- [ ] **Step 5: Run toolbar tests**

Run:

```bash
pnpm vitest run src/components/tolariaEditorFormatting.behavior.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit editor round trip and controls**

Run:

```bash
git add src/utils/highlightMarkdown.ts src/utils/highlightMarkdown.test.ts src/components/editorSchema.tsx src/hooks/useEditorTabSwap.ts src/components/editorRawModeSync.ts src/App.css src/components/tolariaEditorFormatting.tsx src/components/tolariaEditorFormatting.behavior.test.tsx src/components/SingleEditorView.tsx
git commit -m "Let editor highlights survive Markdown round trips" -m "The editor exposes highlight as a BlockNote style but serializes it back to ==text== before Markdown leaves the app." -m "Constraint: Toolbar controls must persist in Markdown" -m "Rejected: Visual-only DOM highlight overlay | would disappear on reload and raw mode" -m "Confidence: medium" -m "Scope-risk: moderate" -m "Tested: pnpm vitest run src/utils/highlightMarkdown.test.ts src/components/editorRawModeSync.test.ts src/components/tolariaEditorFormatting.behavior.test.tsx"
```

Expected: commit succeeds.

## Task 4: Derived Highlights Index Hook

**Files:**
- Create: `src/hooks/useHighlightsIndex.ts`
- Create: `src/hooks/useHighlightsIndex.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `src/hooks/useHighlightsIndex.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import type { VaultEntry } from '../types'
import { useHighlightsIndex } from './useHighlightsIndex'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

function entry(path: string, title: string): VaultEntry {
  return {
    path,
    filename: path.split('/').pop() ?? path,
    title,
    isA: 'Note',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: 1,
    createdAt: 1,
    fileSize: 10,
    snippet: '',
    wordCount: 2,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: true,
    organized: true,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: true,
    fileKind: 'markdown',
  }
}

describe('useHighlightsIndex', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('lazily reads markdown notes and groups highlights', async () => {
    vi.mocked(invoke).mockImplementation(async (_command, args) => {
      const path = (args as { path: string }).path
      if (path.endsWith('alpha.md')) return '# Alpha\n\n==first passage=='
      return '# Beta\n\nNo highlights'
    })

    const entries = [
      entry('/vault/alpha.md', 'Alpha'),
      entry('/vault/beta.md', 'Beta'),
    ]
    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
      openTabContentByPath: {},
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].highlights[0].excerpt).toBe('first passage')
  })

  it('uses open tab content before reading from disk', async () => {
    const entries = [entry('/vault/open.md', 'Open')]
    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
      openTabContentByPath: {
        '/vault/open.md': '# Open\n\n==live content==',
      },
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(invoke).not.toHaveBeenCalled()
    expect(result.current.groups[0].highlights[0].excerpt).toBe('live content')
  })
})
```

- [ ] **Step 2: Run hook tests and verify failure**

Run:

```bash
pnpm vitest run src/hooks/useHighlightsIndex.test.tsx
```

Expected: fail because `useHighlightsIndex.ts` does not exist.

- [ ] **Step 3: Implement lazy highlights index**

Create `src/hooks/useHighlightsIndex.ts`:

```ts
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { VaultEntry } from '../types'
import {
  buildHighlightGroups,
  filterHighlightGroups,
  parseEntryHighlights,
  type HighlightExcerpt,
  type HighlightGroup,
} from '../utils/highlightMarkdown'

interface UseHighlightsIndexOptions {
  entries: VaultEntry[]
  enabled: boolean
  vaultPath?: string | null
  openTabContentByPath: Record<string, string>
}

interface HighlightsIndexState {
  groups: HighlightGroup[]
  highlights: HighlightExcerpt[]
  loading: boolean
  error: string | null
}

function isIndexableMarkdownEntry(entry: VaultEntry): boolean {
  return !entry.archived && (entry.fileKind ?? 'markdown') === 'markdown'
}

export function useHighlightsIndex({
  entries,
  enabled,
  vaultPath,
  openTabContentByPath,
}: UseHighlightsIndexOptions): HighlightsIndexState {
  const indexableEntries = useMemo(
    () => entries.filter(isIndexableMarkdownEntry),
    [entries],
  )
  const [state, setState] = useState<HighlightsIndexState>({
    groups: [],
    highlights: [],
    loading: false,
    error: null,
  })

  useEffect(() => {
    if (!enabled) {
      setState({ groups: [], highlights: [], loading: false, error: null })
      return
    }

    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))

    async function buildIndex() {
      const highlights: HighlightExcerpt[] = []
      for (const entry of indexableEntries) {
        const openContent = openTabContentByPath[entry.path]
        const content = openContent ?? await invoke<string>('get_note_content', {
          path: entry.path,
          vaultPath: vaultPath ?? undefined,
        })
        highlights.push(...parseEntryHighlights(entry, content))
      }

      const groups = buildHighlightGroups(
        highlights,
        indexableEntries.map((entry) => entry.path),
      )

      if (!cancelled) {
        setState({ groups, highlights, loading: false, error: null })
      }
    }

    buildIndex().catch((error) => {
      if (!cancelled) {
        setState({
          groups: [],
          highlights: [],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [enabled, indexableEntries, openTabContentByPath, vaultPath])

  return state
}

export { filterHighlightGroups }
export type { HighlightExcerpt, HighlightGroup }
```

- [ ] **Step 4: Run hook tests**

Run:

```bash
pnpm vitest run src/hooks/useHighlightsIndex.test.tsx src/utils/highlightMarkdown.test.ts
```

Expected: pass.

## Task 5: Sidebar Highlights Collection And Grouped List

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/sidebar/SidebarTopNav.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`
- Create: `src/components/note-list/HighlightsList.tsx`
- Create: `src/components/note-list/HighlightsList.test.tsx`
- Modify: `src/components/note-list/useNoteListModel.tsx`
- Modify: `src/components/note-list/NoteListLayout.tsx`
- Modify: `src/components/note-list/noteListUtils.ts`
- Modify: `src/utils/noteListHelpers.ts`

- [ ] **Step 1: Add failing sidebar test**

In `src/components/Sidebar.test.tsx`, add:

```tsx
it('renders a top-level Highlights row with count', () => {
  renderSidebar({
    selection: { kind: 'filter', filter: 'all' },
    entries: [buildEntry({ path: '/vault/a.md', title: 'Alpha' })],
    highlightCount: 2,
  })

  expect(screen.getByText('Highlights')).toBeInTheDocument()
  expect(screen.getByText('2')).toBeInTheDocument()
})
```

If `renderSidebar` does not accept `highlightCount`, extend the local test helper with a default `highlightCount: 0`.

- [ ] **Step 2: Add failing HighlightsList tests**

Create `src/components/note-list/HighlightsList.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HighlightsList } from './HighlightsList'
import type { HighlightGroup } from '../../utils/highlightMarkdown'

const groups: HighlightGroup[] = [
  {
    notePath: '/vault/a.md',
    noteTitle: 'Harnessing the harness',
    highlights: [
      {
        id: 'h1',
        notePath: '/vault/a.md',
        noteTitle: 'Harnessing the harness',
        excerpt: 'retrieval is infrastructure',
        startOffset: 10,
        endOffset: 41,
      },
    ],
  },
]

describe('HighlightsList', () => {
  it('renders grouped highlights', () => {
    render(<HighlightsList groups={groups} loading={false} error={null} onOpenHighlight={vi.fn()} />)

    expect(screen.getByText('Harnessing the harness')).toBeInTheDocument()
    expect(screen.getByText('retrieval is infrastructure')).toBeInTheDocument()
  })

  it('filters by excerpt text', () => {
    render(<HighlightsList groups={groups} loading={false} error={null} onOpenHighlight={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Filter highlights'), {
      target: { value: 'missing' },
    })

    expect(screen.getByText('No matching highlights')).toBeInTheDocument()
  })

  it('opens a highlighted excerpt', () => {
    const onOpenHighlight = vi.fn()
    render(<HighlightsList groups={groups} loading={false} error={null} onOpenHighlight={onOpenHighlight} />)

    fireEvent.click(screen.getByText('retrieval is infrastructure'))

    expect(onOpenHighlight).toHaveBeenCalledWith(groups[0].highlights[0])
  })
})
```

- [ ] **Step 3: Run UI tests and verify failure**

Run:

```bash
pnpm vitest run src/components/Sidebar.test.tsx src/components/note-list/HighlightsList.test.tsx
```

Expected: fail because the UI and prop types do not exist yet.

- [ ] **Step 4: Extend sidebar selection types**

Modify `src/types.ts`:

```ts
export type SidebarFilter = 'all' | 'archived' | 'changes' | 'pulse' | 'inbox' | 'favorites' | 'highlights'
```

- [ ] **Step 5: Add SidebarTopNav Highlights row**

Modify imports in `src/components/sidebar/SidebarTopNav.tsx`:

```ts
import { Archive, FileText, Highlighter, Tray } from '@phosphor-icons/react'
```

Add prop:

```ts
  highlightCount: number
```

Add to destructuring:

```ts
  highlightCount,
```

Render after All Notes and before Archive:

```tsx
      <NavItem
        icon={Highlighter}
        label="Highlights"
        count={highlightCount}
        isActive={isSelectionActive(selection, { kind: 'filter', filter: 'highlights' })}
        badgeClassName="text-muted-foreground"
        badgeStyle={{ background: 'var(--muted)' }}
        activeBadgeClassName="bg-primary text-primary-foreground"
        onClick={() => onSelect({ kind: 'filter', filter: 'highlights' })}
      />
```

Modify `src/components/Sidebar.tsx` to accept and forward `highlightCount` with default `0`:

```ts
  highlightCount?: number
```

```tsx
        highlightCount={highlightCount ?? 0}
```

- [ ] **Step 6: Make normal note filtering return empty list for highlights**

Modify `src/utils/noteListHelpers.ts`:

```ts
function filterByFilterType(entries: VaultEntry[], filter: string): VaultEntry[] {
  if (filter === 'all') return entries.filter(isActive)
  if (filter === 'archived') return entries.filter((e) => e.archived)
  if (filter === 'favorites') return entries.filter((e) => e.favorite && !e.archived)
  if (filter === 'pulse') return []
  if (filter === 'highlights') return []
  return []
}
```

Modify `src/components/note-list/noteListUtils.ts`:

```ts
const FILTER_TITLE_KEYS = {
  archived: 'noteList.title.archive',
  changes: 'noteList.title.changes',
  inbox: 'noteList.title.inbox',
  pulse: 'noteList.title.history',
  highlights: 'noteList.title.highlights',
} as const
```

If i18n keys are required by type checks, add `noteList.title.highlights: 'Highlights'` in the English locale file located by:

```bash
rg -n "noteList.title.history|noteList.title.archive" src/lib src -g '*.ts'
```

- [ ] **Step 7: Create HighlightsList**

Create `src/components/note-list/HighlightsList.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Highlighter } from '@phosphor-icons/react'
import { Input } from '../ui/input'
import {
  filterHighlightGroups,
  type HighlightExcerpt,
  type HighlightGroup,
} from '../../utils/highlightMarkdown'

interface HighlightsListProps {
  groups: HighlightGroup[]
  loading: boolean
  error: string | null
  onOpenHighlight: (highlight: HighlightExcerpt) => void
}

export function HighlightsList({
  groups,
  loading,
  error,
  onOpenHighlight,
}: HighlightsListProps) {
  const [query, setQuery] = useState('')
  const filteredGroups = useMemo(
    () => filterHighlightGroups(groups, query),
    [groups, query],
  )

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading highlights...</div>
  }

  if (error) {
    return <div className="p-6 text-sm text-destructive">Could not load highlights</div>
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <Input
          aria-label="Filter highlights"
          placeholder="Filter highlights"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No highlights yet
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No matching highlights
          </div>
        ) : (
          filteredGroups.map((group) => (
            <section key={group.notePath} className="mb-4">
              <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.noteTitle}
              </div>
              <div className="space-y-1">
                {group.highlights.map((highlight) => (
                  <button
                    key={highlight.id}
                    type="button"
                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onOpenHighlight(highlight)}
                  >
                    <Highlighter className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                    <span className="line-clamp-3 text-foreground">{highlight.excerpt}</span>
                  </button>
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

- [ ] **Step 8: Branch note-list layout to highlights**

Modify `src/components/note-list/useNoteListModel.tsx` imports:

```ts
import { useHighlightsIndex, type HighlightExcerpt } from '../../hooks/useHighlightsIndex'
```

Add props to `NoteListProps`:

```ts
  vaultPath?: string | null
  openTabContentByPath?: Record<string, string>
  onOpenHighlight?: (highlight: HighlightExcerpt) => void
```

Inside `useNoteListModel`, compute:

```ts
  const isHighlightsView = selection.kind === 'filter' && selection.filter === 'highlights'
  const highlightsIndex = useHighlightsIndex({
    entries,
    enabled: isHighlightsView,
    vaultPath,
    openTabContentByPath: openTabContentByPath ?? {},
  })
```

Return in the layout model:

```ts
    isHighlightsView,
    highlightGroups: highlightsIndex.groups,
    highlightLoading: highlightsIndex.loading,
    highlightError: highlightsIndex.error,
    onOpenHighlight,
```

Modify `src/components/note-list/NoteListLayout.tsx` imports:

```ts
import { HighlightsList } from './HighlightsList'
```

Add `isHighlightsView`, `highlightGroups`, `highlightLoading`, `highlightError`, `onOpenHighlight` to the picked props for `NoteListContent`, and branch before entity/list:

```tsx
      {isHighlightsView ? (
        <HighlightsList
          groups={highlightGroups}
          loading={highlightLoading}
          error={highlightError}
          onOpenHighlight={onOpenHighlight ?? (() => {})}
        />
      ) : entitySelection ? (
```

- [ ] **Step 9: Wire App props**

In `src/App.tsx`, create a memo near `tabs` state usage:

```ts
const openTabContentByPath = useMemo(
  () => Object.fromEntries(tabs.map((tab) => [tab.entry.path, tab.content])),
  [tabs],
)
```

Pass to `Sidebar`:

```tsx
highlightCount={0}
```

Pass to `NoteList`:

```tsx
vaultPath={vaultPath}
openTabContentByPath={openTabContentByPath}
onOpenHighlight={handleOpenHighlight}
```

`highlightCount` becomes real in Task 6 after the app-level index is hoisted. For this task, the Highlights row is selectable and the list view owns the loaded index.

- [ ] **Step 10: Run sidebar/list tests**

Run:

```bash
pnpm vitest run src/components/Sidebar.test.tsx src/components/note-list/HighlightsList.test.tsx src/hooks/useHighlightsIndex.test.tsx
```

Expected: pass.

## Task 6: Highlight Count, Open, Jump, And Pulse

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/SingleEditorView.tsx`
- Modify: `src/utils/highlightMarkdown.ts`
- Modify: `src/hooks/useHighlightsIndex.ts`
- Modify: `src/App.test.tsx` or create focused tests if App is too broad.

- [ ] **Step 1: Hoist highlight index for sidebar count**

In `src/App.tsx`, import:

```ts
import { useHighlightsIndex, type HighlightExcerpt } from './hooks/useHighlightsIndex'
import { HIGHLIGHT_JUMP_EVENT } from './utils/highlightMarkdown'
```

Add:

```ts
const highlightsEnabled = selection.kind === 'filter' && selection.filter === 'highlights'
const highlightsIndex = useHighlightsIndex({
  entries,
  enabled: highlightsEnabled,
  vaultPath,
  openTabContentByPath,
})
```

Pass:

```tsx
<Sidebar
  ...
  highlightCount={highlightsIndex.highlights.length}
/>
```

Pass to `NoteList`:

```tsx
highlightGroups={highlightsIndex.groups}
highlightLoading={highlightsIndex.loading}
highlightError={highlightsIndex.error}
```

Then remove the duplicate `useHighlightsIndex` call from `useNoteListModel` and make `highlightGroups`, `highlightLoading`, and `highlightError` plain optional props passed through to `NoteListLayout`.

- [ ] **Step 2: Implement row activation**

In `src/App.tsx`, add:

```ts
const pendingHighlightJumpRef = useRef<HighlightExcerpt | null>(null)

const dispatchHighlightJump = useCallback((highlight: HighlightExcerpt) => {
  window.dispatchEvent(new CustomEvent(HIGHLIGHT_JUMP_EVENT, {
    detail: highlight,
  }))
}, [])

const handleOpenHighlight = useCallback((highlight: HighlightExcerpt) => {
  const entry = entries.find((candidate) => candidate.path === highlight.notePath)
  if (!entry) {
    setToastMessage('Highlight source note could not be found.')
    return
  }

  pendingHighlightJumpRef.current = highlight
  onReplaceActiveTab(entry)
}, [entries, onReplaceActiveTab])
```

Add an effect after active tab changes:

```ts
useEffect(() => {
  const pending = pendingHighlightJumpRef.current
  if (!pending) return
  if (activeTabPath !== pending.notePath) return

  pendingHighlightJumpRef.current = null
  requestAnimationFrame(() => dispatchHighlightJump(pending))
}, [activeTabPath, dispatchHighlightJump])
```

- [ ] **Step 3: Implement DOM jump listener**

In `src/components/SingleEditorView.tsx`, import:

```ts
import {
  HIGHLIGHT_JUMP_EVENT,
  HIGHLIGHT_PULSE_CLASS,
  type HighlightExcerpt,
} from '../utils/highlightMarkdown'
```

Add helper:

```ts
function findHighlightElement(root: HTMLElement, excerpt: string): HTMLElement | null {
  const marks = Array.from(root.querySelectorAll<HTMLElement>('.tolaria-highlight'))
  const normalizedExcerpt = excerpt.replace(/\s+/g, ' ').trim()
  return marks.find((mark) => (
    mark.textContent?.replace(/\s+/g, ' ').trim() === normalizedExcerpt
  )) ?? null
}
```

Add effect:

```ts
useEffect(() => {
  const handleJump = (event: Event) => {
    const detail = (event as CustomEvent<HighlightExcerpt>).detail
    if (!detail || detail.notePath !== entry.path) return

    requestAnimationFrame(() => {
      const root = editor.domElement
      if (!root) return
      const mark = findHighlightElement(root, detail.excerpt)
      if (!mark) {
        window.dispatchEvent(new CustomEvent('tolaria:toast', {
          detail: 'Highlight could not be located in the note.',
        }))
        return
      }

      mark.scrollIntoView({ block: 'center', behavior: 'smooth' })
      mark.classList.remove(HIGHLIGHT_PULSE_CLASS)
      void mark.offsetWidth
      mark.classList.add(HIGHLIGHT_PULSE_CLASS)
      window.setTimeout(() => {
        mark.classList.remove(HIGHLIGHT_PULSE_CLASS)
      }, 1500)
    })
  }

  window.addEventListener(HIGHLIGHT_JUMP_EVENT, handleJump)
  return () => window.removeEventListener(HIGHLIGHT_JUMP_EVENT, handleJump)
}, [editor, entry.path])
```

If the app already has a toast event bridge, replace `tolaria:toast` with that existing bridge. If no bridge exists, call the existing `onToast` prop from `SingleEditorView` if present; otherwise omit the toast and keep open plus no pulse.

- [ ] **Step 4: Add focused jump unit test**

Create `src/utils/highlightDom.test.ts` only if `findHighlightElement` is extracted from `SingleEditorView.tsx`; otherwise test through `SingleEditorView` existing test utilities.

Use this assertion:

```ts
expect(findHighlightElement(root, 'retrieval is infrastructure')).toBe(mark)
```

- [ ] **Step 5: Run app-level tests**

Run:

```bash
pnpm vitest run src/hooks/useHighlightsIndex.test.tsx src/components/note-list/HighlightsList.test.tsx src/App.test.tsx
```

Expected: pass.

- [ ] **Step 6: Commit sidebar/list/jump**

Run:

```bash
git add src/types.ts src/components/sidebar/SidebarTopNav.tsx src/components/Sidebar.tsx src/components/Sidebar.test.tsx src/components/note-list/HighlightsList.tsx src/components/note-list/HighlightsList.test.tsx src/components/note-list/useNoteListModel.tsx src/components/note-list/NoteListLayout.tsx src/components/note-list/noteListUtils.ts src/utils/noteListHelpers.ts src/hooks/useHighlightsIndex.ts src/hooks/useHighlightsIndex.test.tsx src/App.tsx src/components/SingleEditorView.tsx src/App.css
git commit -m "Surface Markdown highlights as a sidebar collection" -m "The Highlights collection derives grouped excerpts lazily from note Markdown and opens the source note for best-effort jump targeting." -m "Constraint: The index must be reconstructible from Markdown content" -m "Rejected: Saved View implementation | highlights are not a user-authored query over notes" -m "Confidence: medium" -m "Scope-risk: moderate" -m "Tested: pnpm vitest run src/hooks/useHighlightsIndex.test.tsx src/components/note-list/HighlightsList.test.tsx src/App.test.tsx"
```

Expected: commit succeeds.

## Task 7: Smoke Test And Documentation

**Files:**
- Create: `tests/smoke/highlights.spec.ts`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ABSTRACTIONS.md`

- [ ] **Step 1: Add Playwright smoke test**

Create `tests/smoke/highlights.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('persistent highlights round-trip and appear in Highlights collection', async ({ page }) => {
  await page.goto('/')

  await page.getByText('All Notes').click()
  await page.getByText('Harnessing the harness').click()

  const editor = page.locator('.bn-editor').first()
  await expect(editor).toBeVisible()

  await editor.getByText(/multi-agent orchestrator|infrastructure around AI/i).first().dblclick()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+H' : 'Control+Shift+H')

  await expect(page.locator('.tolaria-highlight').first()).toBeVisible()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+S' : 'Control+S')
  await page.reload()

  await page.getByText('All Notes').click()
  await page.getByText('Harnessing the harness').click()
  await expect(page.locator('.tolaria-highlight').first()).toBeVisible()

  await page.getByText('Highlights').click()
  await page.getByPlaceholder('Filter highlights').fill('infrastructure')
  await expect(page.getByText(/infrastructure/i).first()).toBeVisible()
  await page.getByText(/infrastructure/i).first().click()
  await expect(page.locator('.tolaria-highlight').first()).toBeVisible()
})
```

If the selected demo note text differs, update only the two visible text matchers after verifying the demo vault contains a stable paragraph in `demo-vault-v2/`.

- [ ] **Step 2: Document architecture**

Append to `docs/ARCHITECTURE.md` under the editor or search/indexing section:

```md
### Persistent Highlights

Highlights are stored inline in Markdown as `==highlighted text==`. The editor renders them through a BlockNote `highlight` style, but save and raw-mode sync restore the style back to Markdown before content leaves the editor. The Highlights sidebar collection derives its grouped index from note content at runtime, so there is no sidecar highlight database to merge or migrate.
```

- [ ] **Step 3: Document abstraction**

Append to `docs/ABSTRACTIONS.md`:

```md
### Highlight Markdown Utilities

`src/utils/highlightMarkdown.ts` owns the portable highlight contract. It parses balanced `==...==` spans, creates deterministic runtime IDs, groups/filter excerpts for the sidebar collection, and translates between Markdown syntax and the BlockNote `highlight` style. Callers should not persist highlight IDs because they are derived from note path, offsets, and excerpt content.
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm vitest run src/utils/highlightMarkdown.test.ts src/hooks/useHighlightsIndex.test.tsx src/components/tolariaEditorFormatting.behavior.test.tsx src/components/note-list/HighlightsList.test.tsx src/components/Sidebar.test.tsx
```

Expected: pass.

- [ ] **Step 5: Run typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 6: Run smoke test**

Run:

```bash
pnpm dev --port 5201
```

In a second terminal:

```bash
BASE_URL="http://localhost:5201" npx playwright test tests/smoke/highlights.spec.ts
```

Expected: pass. Stop the dev server after the smoke test.

- [ ] **Step 7: Run native screenshot QA**

Run:

```bash
pnpm tauri dev
```

After the app launches:

```bash
bash ~/.openclaw/skills/tolaria-qa/scripts/focus-app.sh laputa
bash ~/.openclaw/skills/tolaria-qa/scripts/screenshot.sh /tmp/tolaria-highlights.png
```

Expected: screenshot shows Tolaria without broken chrome. Stop `pnpm tauri dev` after capture.

- [ ] **Step 8: Commit docs and smoke test**

Run:

```bash
git add tests/smoke/highlights.spec.ts docs/ARCHITECTURE.md docs/ABSTRACTIONS.md
git commit -m "Protect persistent highlights with smoke coverage" -m "The smoke path covers create, save, reload, sidebar discovery, filter, and jump visibility for Markdown-backed highlights." -m "Constraint: Highlighting touches a core search/navigation workflow" -m "Confidence: medium" -m "Scope-risk: narrow" -m "Tested: pnpm vitest run focused highlights tests; npx tsc --noEmit; BASE_URL=http://localhost:5201 npx playwright test tests/smoke/highlights.spec.ts" -m "Not-tested: Full pre-push suite until final push"
```

Expected: commit succeeds.

## Task 8: Final Verification And Push

**Files:**
- All touched code, docs, and tests.

- [ ] **Step 1: Run full frontend checks**

Run:

```bash
pnpm lint && npx tsc --noEmit && pnpm test && pnpm test:coverage
```

Expected: pass and frontend coverage remains at or above the configured threshold.

- [ ] **Step 2: Run Rust checks**

Run:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo llvm-cov --manifest-path src-tauri/Cargo.toml --no-clean --fail-under-lines 85
```

Expected: pass.

- [ ] **Step 3: Confirm demo vault cleanliness**

Run:

```bash
git status --short -- demo-vault demo-vault-v2
```

Expected: no output unless a demo fixture change was intentionally committed.

- [ ] **Step 4: Run final status check**

Run:

```bash
git status --short
```

Expected: only unrelated pre-existing local files may remain. No highlight implementation files should be unstaged.

- [ ] **Step 5: Push main**

Run:

```bash
git push origin main
```

Expected: push succeeds. If pre-push updates `.codescene-thresholds`, commit that ratchet update with a Lore-style message and push again.

## Self-Review Checklist

- Spec coverage: create/remove highlight, Markdown persistence, reload rendering, sidebar collection, grouped excerpts, filter, jump/pulse, lazy derived index, one yellow color, no sidecar store.
- No placeholder work: every code-changing task includes exact files, snippets, commands, and expected outcomes.
- Type consistency: `HighlightExcerpt`, `HighlightGroup`, `HIGHLIGHT_STYLE_KEY`, `HIGHLIGHT_JUMP_EVENT`, `useHighlightsIndex`, and `filter: 'highlights'` are named consistently across tasks.
- Upstream compatibility: changes are additive and localized around app-owned editor formatting, Markdown utilities, sidebar nav, and note-list branching.
