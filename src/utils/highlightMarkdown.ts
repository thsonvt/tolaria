import type { VaultEntry } from '../types'

export const HIGHLIGHT_STYLE_KEY = 'highlight' as const
export const HIGHLIGHT_JUMP_EVENT = 'tolaria:highlight-jump' as const
export const HIGHLIGHT_PULSE_CLASS = 'tolaria-highlight-pulse' as const
const HIGHLIGHT_OPEN_SENTINEL = 'TOLARIA_HIGHLIGHT_OPEN'
const HIGHLIGHT_CLOSE_SENTINEL = 'TOLARIA_HIGHLIGHT_CLOSE'

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

type TableCellLike = {
  content?: InlineText[]
  [key: string]: unknown
}

type TableRowLike = {
  cells?: Array<TableCellLike | string>
  [key: string]: unknown
}

type TableContentLike = {
  type?: string
  rows?: TableRowLike[]
  [key: string]: unknown
}

type BlockContent = Array<InlineText | Record<string, unknown>> | TableContentLike | unknown

type EditorBlock = {
  content?: BlockContent
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

function readBalancedHighlight(markdown: string, start: number): {
  closeOffset: number
  rawText: string
} | null {
  if (!isOpeningBoundaryEquals(markdown, start)) return null

  const contentStart = start + 2
  let index = contentStart

  while (index < markdown.length - 1) {
    if (isClosingBoundaryEquals(markdown, index)) {
      return {
        closeOffset: index,
        rawText: markdown.slice(contentStart, index),
      }
    }
    index += 1
  }

  return null
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
    const highlight = readBalancedHighlight(markdown, index)
    if (!highlight) {
      index += 1
      continue
    }

    const openOffset = index
    const excerpt = normalizeExcerpt(highlight.rawText)
    if (excerpt.length > 0) {
      const endOffset = highlight.closeOffset + 2
      highlights.push({
        id: buildHighlightId(notePath, openOffset, endOffset, excerpt),
        notePath,
        noteTitle,
        excerpt,
        startOffset: openOffset,
        endOffset,
      })
    }

    index = highlight.closeOffset + 2
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

export function preProcessHighlightMarkdown(markdown: string): string {
  let result = ''
  let index = 0

  while (index < markdown.length) {
    const highlight = readBalancedHighlight(markdown, index)
    if (!highlight) {
      result += markdown[index]
      index += 1
      continue
    }

    if (normalizeExcerpt(highlight.rawText).length === 0) {
      result += markdown.slice(index, highlight.closeOffset + 2)
    } else {
      result += `${HIGHLIGHT_OPEN_SENTINEL}${highlight.rawText}${HIGHLIGHT_CLOSE_SENTINEL}`
    }
    index = highlight.closeOffset + 2
  }

  return result
}

function isTableContent(content: BlockContent): content is TableContentLike {
  return Boolean(
    content
      && typeof content === 'object'
      && !Array.isArray(content)
      && (content as TableContentLike).type === 'tableContent'
      && Array.isArray((content as TableContentLike).rows),
  )
}

function transformTableCell(
  cell: TableCellLike | string,
  transform: (content: InlineText[]) => InlineText[],
): TableCellLike | string {
  if (typeof cell === 'string' || !Array.isArray(cell.content)) return cell
  return { ...cell, content: transform(cell.content) }
}

function transformContent(
  content: BlockContent,
  transform: (content: InlineText[]) => InlineText[],
): BlockContent {
  if (Array.isArray(content)) return transform(content as InlineText[])
  if (isTableContent(content)) {
    return {
      ...content,
      rows: content.rows?.map((row) => ({
        ...row,
        cells: row.cells?.map((cell) => transformTableCell(cell, transform)),
      })),
    }
  }
  return content
}

function highlightStyles(styles?: Record<string, boolean | string>): Record<string, boolean | string> {
  return { ...(styles ?? {}), [HIGHLIGHT_STYLE_KEY]: true }
}

function expandHighlightTokensInContent(content: InlineText[]): InlineText[] {
  return content.flatMap(expandHighlightTokensInItem)
}

function expandHighlightTokensInItem(item: InlineText): InlineText[] {
  if (item.type !== 'text' || typeof item.text !== 'string' || !item.text.includes(HIGHLIGHT_OPEN_SENTINEL)) {
    return [item]
  }

  const parts: InlineText[] = []
  let cursor = 0
  const { text } = item

  while (cursor < text.length) {
    const openIndex = text.indexOf(HIGHLIGHT_OPEN_SENTINEL, cursor)
    if (openIndex === -1) {
      if (cursor < text.length) parts.push({ ...item, text: text.slice(cursor) })
      break
    }

    if (openIndex > cursor) {
      parts.push({ ...item, text: text.slice(cursor, openIndex) })
    }

    const contentStart = openIndex + HIGHLIGHT_OPEN_SENTINEL.length
    const closeIndex = text.indexOf(HIGHLIGHT_CLOSE_SENTINEL, contentStart)
    if (closeIndex === -1) {
      parts.push({ ...item, text: text.slice(openIndex) })
      break
    }

    if (closeIndex > contentStart) {
      parts.push({
        ...item,
        text: text.slice(contentStart, closeIndex),
        styles: highlightStyles(item.styles),
      })
    }
    cursor = closeIndex + HIGHLIGHT_CLOSE_SENTINEL.length
  }

  return parts
}

function injectHighlightsInBlock<T extends EditorBlock>(block: T): T {
  return {
    ...block,
    content: transformContent(block.content, expandHighlightTokensInContent),
    children: Array.isArray(block.children)
      ? injectHighlightsInBlocks(block.children)
      : block.children,
  }
}

export function injectHighlightsInBlocks<T extends EditorBlock>(blocks: T[]): T[] {
  return blocks.map(injectHighlightsInBlock)
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
    content: transformContent(block.content, (content) => (
      content.map((inline) => (
        inline.type === 'text' && typeof inline.text === 'string'
          ? restoreHighlightText(inline)
          : inline
      ))
    )),
    children: Array.isArray(block.children)
      ? restoreHighlightsInBlocks(block.children)
      : block.children,
  }))
}
