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

function isOpeningBoundaryEquals(markdown: string, index: number): boolean {
  return markdown[index] === '='
    && markdown[index + 1] === '='
    && markdown[index - 1] !== '='
    && markdown[index + 2] !== '='
}

function isClosingBoundaryEquals(markdown: string, index: number): boolean {
  return markdown[index] === '='
    && markdown[index + 1] === '='
    && markdown[index - 1] !== '='
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
    if (!isOpeningBoundaryEquals(markdown, index)) {
      index += 1
      continue
    }

    const openOffset = index
    const contentStart = index + 2
    let closeOffset = -1
    index = contentStart

    while (index < markdown.length - 1) {
      if (isClosingBoundaryEquals(markdown, index)) {
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

  const restStyles = { ...styles }
  delete restStyles[HIGHLIGHT_STYLE_KEY]
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
