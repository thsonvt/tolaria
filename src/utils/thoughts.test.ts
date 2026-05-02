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
    expect(normalizeThoughtRecord({ ...baseThought, notePath: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, noteTitle: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, bodyMarkdown: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, createdAt: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, updatedAt: '' })).toBeNull()
    expect(normalizeThoughtRecord({ ...baseThought, anchor: { type: 'selection', quote: '' } })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, prefix: 42 },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, suffix: false },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, startOffset: Number.NaN },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, endOffset: Number.POSITIVE_INFINITY },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, endOffset: baseThought.anchor.startOffset },
    })).toBeNull()
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

  it('falls back to note title ordering for groups outside the ordered note paths', () => {
    const groups = buildThoughtGroups([
      { ...baseThought, notePath: '/vault/zeta.md', noteTitle: 'Zeta' },
      { ...baseThought, id: 'thought-2', notePath: '/vault/alpha.md', noteTitle: 'Alpha' },
      { ...baseThought, id: 'thought-3', notePath: '/vault/ordered.md', noteTitle: 'Ordered' },
    ], ['/vault/ordered.md'])

    expect(groups.map((group) => group.noteTitle)).toEqual(['Ordered', 'Alpha', 'Zeta'])
  })

  it('filters by thought body, quote, and title', () => {
    const groups = buildThoughtGroups([baseThought], [baseThought.notePath])

    expect(filterThoughtGroups(groups, 'RETRIEVAL-QUALITY')).toHaveLength(1)
    expect(filterThoughtGroups(groups, 'retrieved documents')).toHaveLength(1)
    expect(filterThoughtGroups(groups, 'harness')).toHaveLength(1)
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
    const quote = 'Retrieved documents are where context engineering intersects'
    const startOffset = markdown.indexOf(quote)
    const draft = createSelectionThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Draft body',
      selectedText: quote,
      markdown,
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-fixed',
    })

    expect(draft.anchor).toMatchObject({
      type: 'selection',
      quote,
      startOffset,
      prefix: markdown.slice(Math.max(0, startOffset - 80), startOffset),
      suffix: markdown.slice(startOffset + quote.length, Math.min(markdown.length, startOffset + quote.length + 80)),
    })
  })

  it('normalizes selected whitespace and falls back to safe offsets when exact quote is missing', () => {
    const draft = createSelectionThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Draft body',
      selectedText: '  Retrieved\n\tdocuments   are   where context engineering intersects  ',
      markdown,
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-fixed',
    })

    expect(draft.anchor).toMatchObject({
      type: 'selection',
      quote: 'Retrieved documents are where context engineering intersects',
      startOffset: markdown.indexOf('Retrieved documents'),
    })

    const missingDraft = createSelectionThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Draft body',
      selectedText: 'Missing\n\tselection',
      markdown,
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-missing',
    })

    expect(missingDraft.anchor).toMatchObject({
      type: 'selection',
      quote: 'Missing selection',
      startOffset: 0,
      endOffset: 'Missing selection'.length,
    })
  })

  it('creates article anchors when no text is selected', () => {
    const fixed = createArticleThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Whole article thought',
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-fixed',
    })

    expect(fixed).toMatchObject({
      id: 'thought-fixed',
      anchor: { type: 'article' },
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
    })

    const generated = createArticleThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Whole article thought',
      now: '2026-05-03T08:00:00.000Z',
    })

    expect(generated.id.startsWith('thought-')).toBe(true)
    expect(generated.createdAt).toBe('2026-05-03T08:00:00.000Z')
    expect(generated.updatedAt).toBe('2026-05-03T08:00:00.000Z')
    expect(generated.anchor).toEqual({ type: 'article' })
  })

  it('matches article anchors at the top of the note', () => {
    expect(matchThoughtAnchor({ type: 'article' }, markdown)).toEqual({
      quote: '',
      startOffset: 0,
      endOffset: 0,
    })
  })

  it('matches by stored offsets, then exact quote', () => {
    const offsetMatch = matchThoughtAnchor(baseThought.anchor, markdown)
    expect(offsetMatch?.quote).toBe(baseThought.anchor.type === 'selection' ? baseThought.anchor.quote : '')

    const moved = `${baseThought.anchor.type === 'selection' ? baseThought.anchor.quote : ''}\n\n${markdown}`
    const fallback = matchThoughtAnchor(baseThought.anchor, moved)
    expect(fallback?.startOffset).toBe(0)
  })

  it('prefers the best prefix and suffix context score across multiple quote matches', () => {
    const anchor = {
      type: 'selection' as const,
      quote: 'anchor quote',
      prefix: 'Left context: ',
      suffix: ' [tail]',
      startOffset: 200,
      endOffset: 212,
    }

    const markdownWithBestScore = [
      'Earlier mismatch anchor quote without context.',
      'Left context: anchor quote [tail]',
      'Left context: anchor quote without tail',
    ].join('\n')

    expect(matchThoughtAnchor(anchor, markdownWithBestScore)).toMatchObject({
      startOffset: markdownWithBestScore.indexOf('anchor quote', markdownWithBestScore.indexOf('Left context:')),
      endOffset: markdownWithBestScore.indexOf('anchor quote', markdownWithBestScore.indexOf('Left context:')) + anchor.quote.length,
    })

    const markdownWithScoreOneWinner = [
      'anchor quote with no matching context first.',
      'Partial prefix: anchor quote still wrong.',
      'Left context: anchor quote and no suffix match here.',
    ].join('\n')

    expect(matchThoughtAnchor(anchor, markdownWithScoreOneWinner)).toMatchObject({
      startOffset: markdownWithScoreOneWinner.lastIndexOf(anchor.quote),
      endOffset: markdownWithScoreOneWinner.lastIndexOf(anchor.quote) + anchor.quote.length,
    })
  })

  it('returns null when a selection anchor cannot be found', () => {
    expect(matchThoughtAnchor(baseThought.anchor, '# Other\n\nNo related text.')).toBeNull()
  })
})
