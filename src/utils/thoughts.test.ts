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
