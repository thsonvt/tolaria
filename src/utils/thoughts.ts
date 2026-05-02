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
  | {
      type: 'article'
    }

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

interface SelectionThoughtDraftOptions {
  notePath: string
  noteTitle: string
  selectedText: string
  markdown: string
  bodyMarkdown: string
  now?: string
  id?: string
}

interface ArticleThoughtDraftOptions {
  notePath: string
  noteTitle: string
  bodyMarkdown: string
  now?: string
  id?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeMarkdownWithIndexMap(markdown: string): {
  normalized: string
  rawStarts: number[]
  rawEnds: number[]
} {
  const normalizedChars: string[] = []
  const rawStarts: number[] = []
  const rawEnds: number[] = []

  let index = 0
  while (index < markdown.length) {
    const start = index
    const char = markdown[index]

    if (/\s/.test(char)) {
      index += 1
      while (index < markdown.length && /\s/.test(markdown[index])) {
        index += 1
      }

      normalizedChars.push(' ')
      rawStarts.push(start)
      rawEnds.push(index)
      continue
    }

    normalizedChars.push(char)
    rawStarts.push(index)
    rawEnds.push(index + 1)
    index += 1
  }

  return {
    normalized: normalizedChars.join(''),
    rawStarts,
    rawEnds,
  }
}

function findRawSelectionOffsets(markdown: string, quote: string): {
  startOffset: number
  endOffset: number
} | null {
  if (!quote) return null

  const normalizedMarkdown = normalizeMarkdownWithIndexMap(markdown)
  const normalizedStart = normalizedMarkdown.normalized.indexOf(quote)
  if (normalizedStart < 0) return null

  const normalizedEnd = normalizedStart + quote.length - 1
  return {
    startOffset: normalizedMarkdown.rawStarts[normalizedStart],
    endOffset: normalizedMarkdown.rawEnds[normalizedEnd],
  }
}

function normalizeThoughtAnchor(value: unknown): ThoughtAnchor | null {
  if (!isObject(value) || typeof value.type !== 'string') return null

  if (value.type === 'article') {
    return { type: 'article' }
  }

  if (value.type !== 'selection') return null
  if (!isNonEmptyString(value.quote)) return null
  if (typeof value.prefix !== 'string' || typeof value.suffix !== 'string') return null
  if (!isFiniteNumber(value.startOffset) || !isFiniteNumber(value.endOffset)) return null
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

function createThoughtId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `thought-${crypto.randomUUID()}`
  }

  return `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function contextBefore(markdown: string, startOffset: number): string {
  return markdown.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset)
}

function contextAfter(markdown: string, endOffset: number): string {
  return markdown.slice(endOffset, Math.min(markdown.length, endOffset + CONTEXT_LENGTH))
}

function buildThoughtRecord(options: {
  id?: string
  notePath: string
  noteTitle: string
  anchor: ThoughtAnchor
  bodyMarkdown: string
  now?: string
}): ThoughtRecord {
  const timestamp = options.now ?? new Date().toISOString()

  return {
    id: options.id ?? createThoughtId(),
    notePath: options.notePath,
    noteTitle: options.noteTitle,
    anchor: options.anchor,
    bodyMarkdown: options.bodyMarkdown.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function selectionContextScore(
  markdown: string,
  startOffset: number,
  endOffset: number,
  anchor: Extract<ThoughtAnchor, { type: 'selection' }>,
): number {
  let score = 0

  if (anchor.prefix.length > 0) {
    const prefix = markdown.slice(Math.max(0, startOffset - anchor.prefix.length), startOffset)
    if (prefix === anchor.prefix) score += 1
  }

  if (anchor.suffix.length > 0) {
    const suffix = markdown.slice(endOffset, endOffset + anchor.suffix.length)
    if (suffix === anchor.suffix) score += 1
  }

  return score
}

export function normalizeThoughtRecord(value: unknown): ThoughtRecord | null {
  if (!isObject(value)) return null

  const anchor = normalizeThoughtAnchor(value.anchor)
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

export function buildThoughtGroups(
  thoughts: ThoughtRecord[],
  orderedNotePaths: string[],
): ThoughtGroup[] {
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
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return groups

  return groups
    .map((group) => {
      const titleMatches = group.noteTitle.toLowerCase().includes(normalizedQuery)
      const thoughts = titleMatches
        ? group.thoughts
        : group.thoughts.filter((thought) => {
          const quote = thought.anchor.type === 'selection' ? thought.anchor.quote : ''
          return thought.bodyMarkdown.toLowerCase().includes(normalizedQuery)
            || quote.toLowerCase().includes(normalizedQuery)
        })

      return {
        ...group,
        thoughts,
      }
    })
    .filter((group) => group.thoughts.length > 0)
}

export function createSelectionThoughtDraft(options: SelectionThoughtDraftOptions): ThoughtRecord {
  const quote = normalizeWhitespace(options.selectedText)
  const matchedOffsets = findRawSelectionOffsets(options.markdown, quote)
  const startOffset = matchedOffsets?.startOffset ?? 0
  const endOffset = matchedOffsets?.endOffset ?? quote.length

  return buildThoughtRecord({
    id: options.id,
    notePath: options.notePath,
    noteTitle: options.noteTitle,
    anchor: {
      type: 'selection',
      quote,
      prefix: contextBefore(options.markdown, startOffset),
      suffix: contextAfter(options.markdown, endOffset),
      startOffset,
      endOffset,
    },
    bodyMarkdown: options.bodyMarkdown,
    now: options.now,
  })
}

export function createArticleThoughtDraft(options: ArticleThoughtDraftOptions): ThoughtRecord {
  return buildThoughtRecord({
    id: options.id,
    notePath: options.notePath,
    noteTitle: options.noteTitle,
    anchor: { type: 'article' },
    bodyMarkdown: options.bodyMarkdown,
    now: options.now,
  })
}

export function matchThoughtAnchor(anchor: ThoughtAnchor, markdown: string): ThoughtAnchorMatch | null {
  if (anchor.type === 'article') {
    return {
      quote: '',
      startOffset: 0,
      endOffset: 0,
    }
  }

  if (markdown.slice(anchor.startOffset, anchor.endOffset) === anchor.quote) {
    return {
      quote: anchor.quote,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
    }
  }

  const matches: ThoughtAnchorMatch[] = []
  let startOffset = markdown.indexOf(anchor.quote)

  while (startOffset >= 0) {
    matches.push({
      quote: anchor.quote,
      startOffset,
      endOffset: startOffset + anchor.quote.length,
    })
    startOffset = markdown.indexOf(anchor.quote, startOffset + 1)
  }

  if (matches.length === 0) return null
  return matches.sort((left, right) => {
    const leftScore = selectionContextScore(markdown, left.startOffset, left.endOffset, anchor)
    const rightScore = selectionContextScore(markdown, right.startOffset, right.endOffset, anchor)
    if (leftScore !== rightScore) return rightScore - leftScore

    const leftDistance = Math.abs(left.startOffset - anchor.startOffset)
    const rightDistance = Math.abs(right.startOffset - anchor.startOffset)
    if (leftDistance !== rightDistance) return leftDistance - rightDistance

    return left.startOffset - right.startOffset
  })[0]
}
