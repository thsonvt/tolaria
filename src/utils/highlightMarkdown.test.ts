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
