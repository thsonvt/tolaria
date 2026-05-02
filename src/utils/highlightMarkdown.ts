import type { VaultEntry } from '../types'

export const HIGHLIGHT_STYLE_KEY = 'highlight' as const
export const HIGHLIGHT_JUMP_EVENT = 'tolaria:highlight-jump' as const
export const HIGHLIGHT_PULSE_CLASS = 'tolaria-highlight-pulse' as const
const HIGHLIGHT_OPEN_SENTINEL = '\uE000\uE001'
const HIGHLIGHT_CLOSE_SENTINEL = '\uE000\uE002'
const HIGHLIGHT_WRAPPER_KEY = '__tolariaHighlightWrapper'
const CODE_FENCE_PREFIXES = ['```', '~~~']

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

type InlineItem = {
  type: string
  text?: string
  styles?: Record<string, boolean | string>
  [HIGHLIGHT_WRAPPER_KEY]?: true
  [key: string]: unknown
}

type TableCellLike = {
  content?: InlineItem[]
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

type BlockContent = Array<InlineItem | Record<string, unknown>> | TableContentLike | unknown

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

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0
  for (let current = index - 1; current >= 0 && text[current] === '\\'; current -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function isCodeFence(line: string): boolean {
  const trimmed = line.trimStart()
  return CODE_FENCE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

function isSingleDollar(text: string, index: number): boolean {
  return text[index] === '$' && text[index - 1] !== '$' && text[index + 1] !== '$'
}

function isDoubleDollar(text: string, index: number): boolean {
  return text[index] === '$' && text[index + 1] === '$'
}

function findInlineMathEnd(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    if (isSingleDollar(text, index) && !isEscaped(text, index)) {
      return index
    }
  }
  return -1
}

function readInlineMath(text: string, index: number): { end: number } | null {
  if (!isSingleDollar(text, index) || isEscaped(text, index)) return null
  const end = findInlineMathEnd(text, index)
  if (end === -1) return null

  const latex = text.slice(index + 1, end)
  if (!latex.trim() || /^\s|\s$/.test(latex)) return null
  return { end }
}

function readInlineDisplayMath(text: string, index: number): { end: number } | null {
  if (!isDoubleDollar(text, index) || isEscaped(text, index)) return null

  for (let current = index + 2; current < text.length - 1; current += 1) {
    if (isDoubleDollar(text, current) && !isEscaped(text, current)) {
      return { end: current + 1 }
    }
  }

  return null
}

function readBacktickRun(text: string, index: number): string | null {
  if (text[index] !== '`') return null
  let current = index
  while (text[current] === '`') current += 1
  return text.slice(index, current)
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
  const lines = markdown.split('\n')
  const result: string[] = []
  let inFence = false
  let inDisplayMathBlock = false
  let activeCodeSpanDelimiter: string | null = null

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    if (isCodeFence(line)) {
      inFence = !inFence
      result.push(line)
      continue
    }

    if (inFence) {
      result.push(line)
      continue
    }

    if (inDisplayMathBlock) {
      result.push(line)
      if (line.trim() === '$$') {
        inDisplayMathBlock = false
      }
      continue
    }

    if (line.trim() === '$$') {
      inDisplayMathBlock = true
      result.push(line)
      continue
    }

    let processed = ''
    let index = 0

    while (index < line.length) {
      const char = line[index]

      if (activeCodeSpanDelimiter) {
        const closeIndex = line.indexOf(activeCodeSpanDelimiter, index)
        if (closeIndex === -1) {
          processed += line.slice(index)
          index = line.length
        } else {
          processed += line.slice(index, closeIndex + activeCodeSpanDelimiter.length)
          index = closeIndex + activeCodeSpanDelimiter.length
          activeCodeSpanDelimiter = null
        }
        continue
      }

      const backtickRun = readBacktickRun(line, index)
      if (backtickRun) {
        processed += backtickRun
        index += backtickRun.length
        activeCodeSpanDelimiter = backtickRun
        continue
      }

      const displayMath = readInlineDisplayMath(line, index)
      if (displayMath) {
        processed += line.slice(index, displayMath.end + 1)
        index = displayMath.end + 1
        continue
      }

      const inlineMath = readInlineMath(line, index)
      if (inlineMath) {
        processed += line.slice(index, inlineMath.end + 1)
        index = inlineMath.end + 1
        continue
      }

      const highlight = readBalancedHighlight(line, index)
      if (highlight) {
        if (normalizeExcerpt(highlight.rawText).length === 0) {
          processed += line.slice(index, highlight.closeOffset + 2)
        } else {
          processed += `${HIGHLIGHT_OPEN_SENTINEL}${highlight.rawText}${HIGHLIGHT_CLOSE_SENTINEL}`
        }
        index = highlight.closeOffset + 2
        continue
      }

      processed += char
      index += 1
    }

    result.push(processed)
  }

  return result.join('\n')
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
  transform: (content: InlineItem[]) => InlineItem[],
): TableCellLike | string {
  if (typeof cell === 'string' || !Array.isArray(cell.content)) return cell
  return { ...cell, content: transform(cell.content) }
}

function transformContent(
  content: BlockContent,
  transform: (content: InlineItem[]) => InlineItem[],
): BlockContent {
  if (Array.isArray(content)) return transform(content as InlineItem[])
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

function markItemInsideHighlight<T extends InlineItem>(item: T): T {
  return { ...item, [HIGHLIGHT_WRAPPER_KEY]: true }
}

function injectHighlightsInSequence(content: InlineItem[]): InlineItem[] {
  const result: InlineItem[] = []
  let inHighlight = false

  for (const item of content) {
    if (item.type === 'text' && typeof item.text === 'string') {
      const nextItems = consumeHighlightTokensFromText(item, inHighlight)
      result.push(...nextItems.items)
      inHighlight = nextItems.inHighlight
      continue
    }

    result.push(inHighlight ? markItemInsideHighlight(item) : item)
  }

  return result
}

function consumeHighlightTokensFromText(
  item: InlineItem,
  initialHighlightState: boolean,
): { items: InlineItem[]; inHighlight: boolean } {
  const result: InlineItem[] = []
  let inHighlight = initialHighlightState
  let cursor = 0
  const text = item.text as string

  while (cursor < text.length) {
    const nextToken = inHighlight
      ? text.indexOf(HIGHLIGHT_CLOSE_SENTINEL, cursor)
      : text.indexOf(HIGHLIGHT_OPEN_SENTINEL, cursor)

    if (nextToken === -1) {
      const remaining = text.slice(cursor)
      if (remaining) {
        result.push({
          ...item,
          text: remaining,
          styles: inHighlight ? highlightStyles(item.styles) : item.styles,
        })
      }
      break
    }

    const slice = text.slice(cursor, nextToken)
    if (slice) {
      result.push({
        ...item,
        text: slice,
        styles: inHighlight ? highlightStyles(item.styles) : item.styles,
      })
    }

    cursor = nextToken + (
      inHighlight
        ? HIGHLIGHT_CLOSE_SENTINEL.length
        : HIGHLIGHT_OPEN_SENTINEL.length
    )
    inHighlight = !inHighlight
  }

  return { items: result, inHighlight }
}

function injectHighlightsInBlock<T extends EditorBlock>(block: T): T {
  return {
    ...block,
    content: transformContent(block.content, injectHighlightsInSequence),
    children: Array.isArray(block.children)
      ? injectHighlightsInBlocks(block.children)
      : block.children,
  }
}

export function injectHighlightsInBlocks<T extends EditorBlock>(blocks: T[]): T[] {
  return blocks.map(injectHighlightsInBlock)
}

function isHighlightedInline(item: InlineItem): boolean {
  return item[HIGHLIGHT_WRAPPER_KEY] === true
    || item.styles?.[HIGHLIGHT_STYLE_KEY] === true
}

function stripHighlightFromInline<T extends InlineItem>(item: T): T {
  const nextItem = { ...item }
  delete nextItem[HIGHLIGHT_WRAPPER_KEY]

  if (item.type !== 'text' || typeof item.text !== 'string') return nextItem

  const styles = item.styles ?? {}
  const restStyles = { ...styles }
  delete restStyles[HIGHLIGHT_STYLE_KEY]

  return {
    ...nextItem,
    styles: restStyles,
  }
}

function restoreHighlightsInSequence(content: InlineItem[]): InlineItem[] {
  const result: InlineItem[] = []
  let inHighlight = false

  for (const item of content) {
    const highlighted = isHighlightedInline(item)

    if (highlighted && !inHighlight) {
      result.push({ type: 'text', text: '==', styles: {} })
      inHighlight = true
    } else if (!highlighted && inHighlight) {
      result.push({ type: 'text', text: '==', styles: {} })
      inHighlight = false
    }

    result.push(stripHighlightFromInline(item))
  }

  if (inHighlight) {
    result.push({ type: 'text', text: '==', styles: {} })
  }

  return result
}

export function restoreHighlightsInBlocks<T extends EditorBlock>(blocks: T[]): T[] {
  return blocks.map((block) => ({
    ...block,
    content: transformContent(block.content, restoreHighlightsInSequence),
    children: Array.isArray(block.children)
      ? restoreHighlightsInBlocks(block.children)
      : block.children,
  }))
}
