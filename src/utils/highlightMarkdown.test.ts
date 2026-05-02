import { describe, expect, it } from 'vitest'
import { injectWikilinks, preProcessWikilinks, restoreWikilinksInBlocks } from './wikilinks'
import {
  HIGHLIGHT_STYLE_KEY,
  buildHighlightGroups,
  filterHighlightGroups,
  injectHighlightsInBlocks,
  parseMarkdownHighlights,
  preProcessHighlightMarkdown,
  restoreHighlightsInBlocks,
} from './highlightMarkdown'

const note = {
  notePath: '/vault/Harness Engineering/agent.md',
  noteTitle: 'Harnessing the harness',
}

function readHighlightTokens(text: string): { open: string; close: string } {
  const wrapped = preProcessHighlightMarkdown(text)
  const excerpt = text.slice(2, -2)
  const start = wrapped.indexOf(excerpt)
  return {
    open: wrapped.slice(0, start),
    close: wrapped.slice(start + excerpt.length),
  }
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

  it('parses a highlight when the closing marker is followed by a literal equals', () => {
    const highlights = parseMarkdownHighlights({
      markdown: '==a===',
      ...note,
    })

    expect(highlights).toHaveLength(1)
    expect(highlights[0]).toMatchObject({
      excerpt: 'a',
      startOffset: 0,
      endOffset: 5,
    })
  })

  it('parses a highlight with surrounding text when the closing marker is followed by a literal equals', () => {
    const highlights = parseMarkdownHighlights({
      markdown: 'x ==a=== y',
      ...note,
    })

    expect(highlights).toHaveLength(1)
    expect(highlights[0]).toMatchObject({
      excerpt: 'a',
      startOffset: 2,
      endOffset: 7,
    })
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
      { type: 'text', text: '==', styles: {} },
      { type: 'text', text: 'this passage', styles: {} },
      { type: 'text', text: '==', styles: {} },
    ])
  })
})

describe('highlight Markdown preprocessing', () => {
  it('rewrites balanced highlight spans with internal markers before BlockNote parse', () => {
    const preprocessed = preProcessHighlightMarkdown('Keep ==this passage== safe')

    expect(preprocessed).toContain('this passage')
    expect(preprocessed.startsWith('Keep ')).toBe(true)
    expect(preprocessed.endsWith(' safe')).toBe(true)
    expect(preprocessed).not.toContain('==this passage==')
    expect(preprocessed).not.toContain('TOLARIA_HIGHLIGHT_OPEN')
    expect(preprocessed).not.toContain('TOLARIA_HIGHLIGHT_CLOSE')
  })

  it('injects sentinel token text into styled BlockNote text', () => {
    const { open, close } = readHighlightTokens('==this passage==')
    const injected = injectHighlightsInBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `Keep ${open}this passage${close} safe`,
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

  it('keeps highlight state across split inline text nodes and preserves other styles', () => {
    const { open, close } = readHighlightTokens('==before bold after==')
    const injected = injectHighlightsInBlocks([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: `${open}before `, styles: {} },
          { type: 'text', text: 'bold', styles: { bold: true } },
          { type: 'text', text: ` after${close}`, styles: {} },
        ],
        children: [],
      },
    ])

    expect(injected[0].content).toEqual([
      { type: 'text', text: 'before ', styles: { highlight: true } },
      { type: 'text', text: 'bold', styles: { bold: true, highlight: true } },
      { type: 'text', text: ' after', styles: { highlight: true } },
    ])

    const restored = restoreHighlightsInBlocks(injected)
    const content = restored[0].content as Array<{ type: string; text?: string; styles?: Record<string, boolean | string> }>

    expect(content.map((item) => item.text ?? '')).toEqual(['==', 'before ', 'bold', ' after', '=='])
    expect(content.every((item) => !item.text?.includes('TOLARIA_HIGHLIGHT_'))).toBe(true)
  })

  it('round-trips highlight wrappers around wikilinks without leaking internal markers', () => {
    const preprocessed = preProcessHighlightMarkdown(preProcessWikilinks('==[[Note]]=='))
    const withWikilinks = injectWikilinks([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: preprocessed, styles: {} }],
        children: [],
      },
    ])

    const injected = injectHighlightsInBlocks(withWikilinks as never[])
    const injectedContent = injected[0].content as Array<{ type: string; text?: string; props?: Record<string, unknown> }>
    expect(injectedContent).toHaveLength(1)
    expect(injectedContent[0].type).toBe('wikilink')
    expect(injectedContent[0].props).toEqual({ target: 'Note' })
    expect(injectedContent.every((item) => !(item.text ?? '').includes('TOLARIA_HIGHLIGHT_'))).toBe(true)

    const restored = restoreWikilinksInBlocks(restoreHighlightsInBlocks(injected))
    const content = restored[0].content as Array<{ type: string; text?: string }>

    expect(content.map((item) => item.text ?? item.type)).toEqual(['==', '[[Note]]', '=='])
    expect(content.every((item) => !(item.text ?? '').includes('TOLARIA_HIGHLIGHT_'))).toBe(true)
  })

  it('does not rewrite highlight markers inside inline math', () => {
    expect(preProcessHighlightMarkdown('$==x==$')).toBe('$==x==$')
  })

  it('does not reinterpret the old printable marker text as a highlight', () => {
    const injected = injectHighlightsInBlocks([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'TOLARIA_HIGHLIGHT_OPENxTOLARIA_HIGHLIGHT_CLOSE',
            styles: {},
          },
        ],
        children: [],
      },
    ])

    expect(injected[0].content).toEqual([
      {
        type: 'text',
        text: 'TOLARIA_HIGHLIGHT_OPENxTOLARIA_HIGHLIGHT_CLOSE',
        styles: {},
      },
    ])
  })
})
