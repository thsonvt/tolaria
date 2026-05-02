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
      anchor: { ...baseThought.anchor, startOffset: -1 },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, endOffset: Number.POSITIVE_INFINITY },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, endOffset: -1 },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: { ...baseThought.anchor, endOffset: baseThought.anchor.startOffset },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      id: baseThought.id,
      note_path: baseThought.notePath,
      note_title: baseThought.noteTitle,
      anchor: {
        type: 'selection',
        quote: baseThought.anchor.type === 'selection' ? baseThought.anchor.quote : '',
        prefix: baseThought.anchor.type === 'selection' ? baseThought.anchor.prefix : '',
        suffix: baseThought.anchor.type === 'selection' ? baseThought.anchor.suffix : '',
        start_offset: baseThought.anchor.type === 'selection' ? baseThought.anchor.startOffset : 0,
        end_offset: baseThought.anchor.type === 'selection' ? baseThought.anchor.endOffset : 0,
      },
      body_markdown: baseThought.bodyMarkdown,
      created_at: baseThought.createdAt,
      updated_at: baseThought.updatedAt,
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      note_path: baseThought.notePath,
      anchor: {
        ...baseThought.anchor,
        start_offset: baseThought.anchor.type === 'selection' ? baseThought.anchor.startOffset : 0,
      },
    })).toBeNull()
    expect(normalizeThoughtRecord({
      ...baseThought,
      anchor: {
        type: 'article',
        quote: 'should not exist',
      },
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
    })
    expect(draft.anchor.type).toBe('selection')
    if (draft.anchor.type === 'selection') {
      expect(draft.anchor.prefix).toContain('few-shot examples is always token space.')
      expect(draft.anchor.suffix).toContain('with information retrieval.')
    }
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

  it('returns an article anchor when the normalized selection is whitespace only', () => {
    const draft = createSelectionThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Draft body',
      selectedText: ' \n\t  ',
      markdown,
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-empty-selection',
    })

    expect(draft).toMatchObject({
      id: 'thought-empty-selection',
      anchor: { type: 'article' },
      createdAt: '2026-05-03T08:00:00.000Z',
      updatedAt: '2026-05-03T08:00:00.000Z',
    })
  })

  it('finds the real raw span when the selected quote crosses hard wraps in markdown', () => {
    const wrappedMarkdown = [
      '# Wrapped',
      '',
      'The trade-off with few-shot examples is always token space.',
      'Retrieved documents are where',
      'context engineering    intersects with information retrieval.',
    ].join('\n')
    const selectedText = 'Retrieved documents are where context engineering intersects'
    const rawStartOffset = wrappedMarkdown.indexOf('Retrieved documents are where')
    const rawEndOffset = wrappedMarkdown.indexOf(' with information retrieval.')

    const draft = createSelectionThoughtDraft({
      notePath: baseThought.notePath,
      noteTitle: baseThought.noteTitle,
      bodyMarkdown: 'Draft body',
      selectedText,
      markdown: wrappedMarkdown,
      now: '2026-05-03T08:00:00.000Z',
      id: 'thought-wrapped',
    })

    expect(draft.anchor).toMatchObject({
      type: 'selection',
      quote: selectedText,
      startOffset: rawStartOffset,
      endOffset: rawEndOffset,
    })
    expect(draft.anchor.type).toBe('selection')
    if (draft.anchor.type === 'selection') {
      expect(draft.anchor.startOffset).not.toBe(0)
      expect(draft.anchor.prefix).toContain('few-shot examples is always token space.')
      expect(draft.anchor.suffix).toContain('with information retrieval.')
    }

    expect(matchThoughtAnchor(draft.anchor, wrappedMarkdown)).toMatchObject({
      quote: selectedText,
      startOffset: rawStartOffset,
      endOffset: rawEndOffset,
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
    expect(fallback?.startOffset).toBe(moved.lastIndexOf(baseThought.anchor.type === 'selection' ? baseThought.anchor.quote : ''))
  })

  it('prefers the stored offsets when the same quote appears multiple times', () => {
    const quote = 'Repeated quote'
    const duplicateMarkdown = [
      'Intro Repeated quote first mention.',
      'Spacer line.',
      'Target Repeated quote second mention.',
    ].join('\n')
    const secondStartOffset = duplicateMarkdown.lastIndexOf(quote)
    const secondEndOffset = secondStartOffset + quote.length

    expect(matchThoughtAnchor({
      type: 'selection',
      quote,
      prefix: duplicateMarkdown.slice(Math.max(0, secondStartOffset - 80), secondStartOffset),
      suffix: duplicateMarkdown.slice(secondEndOffset, Math.min(duplicateMarkdown.length, secondEndOffset + 80)),
      startOffset: secondStartOffset,
      endOffset: secondEndOffset,
    }, duplicateMarkdown)).toMatchObject({
      quote,
      startOffset: secondStartOffset,
      endOffset: secondEndOffset,
    })
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

  it('breaks equal-score ties by proximity to the stored start offset before earliest occurrence', () => {
    const quote = 'anchor quote'
    const equalScoreMarkdown = [
      'Lead in. anchor quote with no context.',
      'Spacer line.',
      'Middle anchor quote still with no context.',
      'Spacer line.',
      'Later anchor quote also with no context.',
    ].join('\n')
    const laterStartOffset = equalScoreMarkdown.lastIndexOf(quote)

    expect(matchThoughtAnchor({
      type: 'selection',
      quote,
      prefix: 'missing prefix',
      suffix: 'missing suffix',
      startOffset: laterStartOffset + 2,
      endOffset: laterStartOffset + 2 + quote.length,
    }, equalScoreMarkdown)).toMatchObject({
      startOffset: laterStartOffset,
      endOffset: laterStartOffset + quote.length,
    })
  })

  it('breaks fully tied matches by choosing the earliest candidate', () => {
    const quote = 'anchor quote'
    const tieMarkdown = [
      'First anchor quote here.',
      'Spacer line.',
      'Second anchor quote here.',
    ].join('\n')
    const firstStartOffset = tieMarkdown.indexOf(quote)
    const secondStartOffset = tieMarkdown.lastIndexOf(quote)
    const midpointStartOffset = Math.floor((firstStartOffset + secondStartOffset) / 2)

    expect(matchThoughtAnchor({
      type: 'selection',
      quote,
      prefix: 'missing prefix',
      suffix: 'missing suffix',
      startOffset: midpointStartOffset,
      endOffset: midpointStartOffset + quote.length,
    }, tieMarkdown)).toMatchObject({
      startOffset: firstStartOffset,
      endOffset: firstStartOffset + quote.length,
    })
  })

  it('returns null when a selection anchor cannot be found', () => {
    expect(matchThoughtAnchor(baseThought.anchor, '# Other\n\nNo related text.')).toBeNull()
  })
})
