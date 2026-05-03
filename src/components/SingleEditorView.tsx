import { useEffect, useCallback, useMemo, useRef, useContext, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { trackEvent } from '../lib/telemetry'
import {
  useCreateBlockNote,
  SuggestionMenuController,
  BlockNoteViewRaw,
  ComponentsContext,
  DeleteLinkButton,
  EditLinkButton,
  LinkToolbar,
  LinkToolbarController,
  SideMenuController,
  useComponentsContext,
  useDictionary,
  type LinkToolbarProps,
} from '@blocknote/react'
import { components } from '@blocknote/mantine'
import { MantineContext, MantineProvider } from '@mantine/core'
import { Copy } from '@phosphor-icons/react'
import { ExternalLink } from 'lucide-react'
import { useDocumentThemeMode } from '../hooks/useDocumentThemeMode'
import { useEditorTheme } from '../hooks/useTheme'
import { useImageDrop } from '../hooks/useImageDrop'
import { useImageLightbox } from '../hooks/useImageLightbox'
import { createTranslator, type AppLocale } from '../lib/i18n'
import { isTauri } from '../mock-tauri'
import { buildTypeEntryMap } from '../utils/typeColors'
import { preFilterWikilinks, deduplicateByPath, MIN_QUERY_LENGTH } from '../utils/wikilinkSuggestions'
import { filterPersonMentions, PERSON_MENTION_MIN_QUERY } from '../utils/personMentionSuggestions'
import { attachClickHandlers, enrichSuggestionItems } from '../utils/suggestionEnrichment'
import { openExternalUrl } from '../utils/url'
import { observeNativeTextAssistanceDisabled } from '../lib/nativeTextAssistance'
import { getRuntimeStyleNonce } from '../lib/runtimeStyleNonce'
import {
  HIGHLIGHT_JUMP_EVENT,
  HIGHLIGHT_PULSE_CLASS,
  type HighlightJumpEventDetail,
  normalizeHighlightText,
} from '../utils/highlightMarkdown'
import {
  THOUGHT_JUMP_EVENT,
  THOUGHT_PULSE_CLASS,
  createArticleThoughtDraft,
  createSelectionThoughtDraft,
  matchThoughtAnchor,
  type ThoughtJumpEventDetail,
  type ThoughtRecord,
} from '../utils/thoughts'
import { WikilinkSuggestionMenu, type WikilinkSuggestionItem } from './WikilinkSuggestionMenu'
import type { VaultEntry } from '../types'
import { _wikilinkEntriesRef } from './editorSchema'
import { useBlockNoteSideMenuHoverGuard } from './blockNoteSideMenuHoverGuard'
import { getTolariaSlashMenuItems } from './tolariaEditorFormattingConfig'
import {
  ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT,
  TolariaFormattingToolbar,
  TolariaFormattingToolbarController,
} from './tolariaEditorFormatting'
import { TolariaSideMenu } from './tolariaBlockNoteSideMenu'
import { useEditorLinkActivation } from './useEditorLinkActivation'
import { findNearestTextCursorBlock } from './blockNoteCursorTarget'
import { ThoughtPinsLayer } from './thoughts/ThoughtPinsLayer'
import { ThoughtPopover } from './thoughts/ThoughtPopover'
import { ImageLightbox } from './ImageLightbox'
import { ActionTooltip } from './ui/action-tooltip'
import { Button } from './ui/button'
import {
  activatePlainTextPasteTarget,
  registerPlainTextPasteTarget,
  type PlainTextPasteTarget,
} from '../utils/plainTextPaste'

const TEST_TABLE_MARKDOWN = `| Head 1 | Head 2 | Head 3 |
| --- | --- | --- |
| A | B | C |
| D | E | F |
`
const CONTAINER_CLICK_IGNORE_SELECTOR = [
  '[contenteditable="true"]',
  '.bn-formatting-toolbar',
  '.bn-link-toolbar',
  '.bn-side-menu',
  '.bn-form-popover',
  '[data-editor-code-copy]',
  '[role="menu"]',
  '[role="dialog"]',
].join(', ')
const TOOLBAR_MOUSE_DOWN_ALLOW_SELECTOR = [
  '[role="menu"]',
  '[role="dialog"]',
  'button[aria-haspopup]',
  'input',
  'textarea',
  '[contenteditable="true"]',
].join(', ')
const EDITOR_EDITABLE_SELECTOR = '[contenteditable="true"]'
const EDITOR_SHORTCUT_IGNORE_SELECTOR = [
  '.bn-formatting-toolbar',
  '.bn-link-toolbar',
  '.bn-side-menu',
  '.bn-form-popover',
  '[role="menu"]',
  '[role="dialog"]',
  'button',
  'input',
  'select',
  'textarea',
].join(', ')
const THOUGHT_PULSE_DURATION_MS = 1400

type TestTableBlock = {
  type?: string
  content?: { type?: string; columnWidths?: Array<number | null> }
}
type SuggestionAction = () => void
type SuggestionItemWithClick = { onItemClick?: SuggestionAction }
interface ThoughtPopoverAnchorPoint {
  top: number
  left: number
}

function normalizeThoughtSelectionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeThoughtOffsetText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function thoughtErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function isEditorReadyForSuggestionAction(
  editor: ReturnType<typeof useCreateBlockNote>,
  container: HTMLElement | null,
) {
  if (!container?.isConnected) return false

  const editorElement = editor.domElement
  if (!(editorElement instanceof HTMLElement)) return true

  return editorElement.isConnected && container.contains(editorElement)
}

function runSuggestionActionSafely({
  action,
  container,
  editor,
}: {
  action: SuggestionAction
  container: HTMLElement | null
  editor: ReturnType<typeof useCreateBlockNote>
}) {
  if (!isEditorReadyForSuggestionAction(editor, container)) return

  try {
    action()
  } catch (error) {
    console.warn('[editor] Ignored stale suggestion menu action:', error)
  }
}

function guardSuggestionMenuItems<T extends SuggestionItemWithClick>(
  items: T[],
  runEditorAction: (action: SuggestionAction) => void,
): T[] {
  return items.map((item) => {
    if (!item.onItemClick) return item

    const onItemClick = item.onItemClick
    return {
      ...item,
      onItemClick: () => runEditorAction(onItemClick),
    }
  })
}

function SharedContextBlockNoteView(props: React.ComponentProps<typeof BlockNoteViewRaw>) {
  const { children, className, theme, ...rest } = props
  const mantineContext = useContext(MantineContext)
  const colorScheme = theme === 'dark' ? 'dark' : 'light'
  const view = (
    <ComponentsContext.Provider value={components}>
      <BlockNoteViewRaw
        {...rest}
        className={['bn-mantine', className].filter(Boolean).join(' ')}
        data-mantine-color-scheme={colorScheme}
        theme={theme}
      >
        {children}
      </BlockNoteViewRaw>
    </ComponentsContext.Provider>
  )

  if (mantineContext) return view

  return (
    <MantineProvider
      // BlockNote scopes Mantine defaults under `.bn-mantine` instead of `:root`.
      withCssVariables={false}
      getStyleNonce={getRuntimeStyleNonce}
      getRootElement={() => undefined}
    >
      {view}
    </MantineProvider>
  )
}

function shouldAllowToolbarMouseDown(target: HTMLElement) {
  return Boolean(target.closest(TOOLBAR_MOUSE_DOWN_ALLOW_SELECTOR))
}

function handleToolbarMouseDownCapture(
  event: Pick<React.MouseEvent<HTMLElement>, 'target' | 'preventDefault'>,
) {
  if (!(event.target instanceof HTMLElement) || shouldAllowToolbarMouseDown(event.target)) {
    return
  }

  event.preventDefault()
}

function isHighlightShortcut(event: KeyboardEvent | React.KeyboardEvent) {
  return (event.metaKey || event.ctrlKey)
    && event.shiftKey
    && (event.key.toLowerCase() === 'h' || event.code === 'KeyH')
}

function TolariaOpenLinkButton({ url }: Pick<LinkToolbarProps, 'url'>) {
  const Components = useComponentsContext()!
  const dict = useDictionary()
  const handleOpen = useCallback(() => {
    void openExternalUrl(url).catch((error) => {
      console.warn('[link] Failed to open URL from toolbar:', error)
    })
  }, [url])

  return (
    <Components.LinkToolbar.Button
      className="bn-button"
      label={dict.link_toolbar.open.tooltip}
      mainTooltip={dict.link_toolbar.open.tooltip}
      isSelected={false}
      onClick={handleOpen}
      icon={<ExternalLink size={16} />}
    />
  )
}

function TolariaLinkToolbar(props: LinkToolbarProps) {
  return (
    <LinkToolbar {...props}>
      <EditLinkButton
        url={props.url}
        text={props.text}
        range={props.range}
        setToolbarOpen={props.setToolbarOpen}
        setToolbarPositionFrozen={props.setToolbarPositionFrozen}
      />
      <TolariaOpenLinkButton url={props.url} />
      <DeleteLinkButton
        range={props.range}
        setToolbarOpen={props.setToolbarOpen}
      />
    </LinkToolbar>
  )
}

function applySeededColumnWidths(
  parsedBlocks: Array<TestTableBlock>,
  columnWidths?: Array<number | null>,
) {
  if (!columnWidths) return

  const tableBlock = parsedBlocks[0]
  if (tableBlock?.type !== 'table') return

  const tableContent = tableBlock.content
  if (tableContent?.type !== 'tableContent') return

  tableContent.columnWidths = [...columnWidths]
}

async function seedEditorWithTestTable(
  editor: ReturnType<typeof useCreateBlockNote>,
  columnWidths?: Array<number | null>,
) {
  const parsedBlocks = await Promise.resolve(
    editor.tryParseMarkdownToBlocks(TEST_TABLE_MARKDOWN),
  ) as Array<TestTableBlock>

  applySeededColumnWidths(parsedBlocks, columnWidths)

  const tableHtml = editor.blocksToHTMLLossy([
    ...parsedBlocks,
    { type: 'paragraph', content: [], children: [] },
  ] as typeof editor.document)
  editor._tiptapEditor.commands.setContent(tableHtml)
  editor.focus()
}

function useSeedBlockNoteTableBridge(editor: ReturnType<typeof useCreateBlockNote>) {
  useEffect(() => {
    const seedBlockNoteTable = (columnWidths?: Array<number | null>) => (
      seedEditorWithTestTable(editor, columnWidths)
    )

    window.__laputaTest = {
      ...window.__laputaTest,
      seedBlockNoteTable,
    }

    return () => {
      if (window.__laputaTest?.seedBlockNoteTable === seedBlockNoteTable) {
        delete window.__laputaTest.seedBlockNoteTable
      }
    }
  }, [editor])
}

function shouldIgnoreContainerClick(target: HTMLElement) {
  return Boolean(target.closest(CONTAINER_CLICK_IGNORE_SELECTOR))
}

function normalizeSuggestionQuery(query: string, triggerCharacter: string): string {
  return query.startsWith(triggerCharacter)
    ? query.slice(triggerCharacter.length)
    : query
}

function isSelectionInsideElement(element: HTMLElement): boolean {
  const selection = window.getSelection()
  const anchorNode = selection?.anchorNode ?? null
  const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null
  return Boolean(anchorElement && element.contains(anchorElement))
}

function getSelectedTextInsideElement(element: HTMLElement): string {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return ''

  const range = selection.getRangeAt(0)
  if (!rangeBelongsToElement(range, element)) return ''

  return normalizeThoughtSelectionText(selection.toString())
}

function resolveThoughtScrollContainer(container: HTMLElement): HTMLElement {
  return container.closest<HTMLElement>('.editor-scroll-area') ?? container
}

function thoughtAnchorPointFromRect(
  container: HTMLElement,
  rect: DOMRect,
): ThoughtPopoverAnchorPoint | null {
  if (!(rect.width || rect.height)) return null

  const containerRect = container.getBoundingClientRect()
  const maxLeft = Math.max(container.clientWidth - 12, 12)
  return {
    top: Math.max(rect.top - containerRect.top + rect.height / 2, 12),
    left: Math.min(Math.max(rect.left - containerRect.left + rect.width / 2, 12), maxLeft),
  }
}

function resolveSelectionThoughtAnchorPoint(
  container: HTMLElement,
): ThoughtPopoverAnchorPoint | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null

  const range = selection.getRangeAt(0)
  if (!rangeBelongsToElement(range, container)) return null

  return thoughtAnchorPointFromRect(container, range.getBoundingClientRect())
}

function resolveThoughtPopoverAnchorPoint(options: {
  container: HTMLElement
  anchorElement?: HTMLElement | null
}): ThoughtPopoverAnchorPoint {
  const { container, anchorElement } = options

  if (anchorElement?.isConnected) {
    const anchorPoint = thoughtAnchorPointFromRect(
      container,
      anchorElement.getBoundingClientRect(),
    )
    if (anchorPoint) return anchorPoint
  }

  const selectionPoint = resolveSelectionThoughtAnchorPoint(container)
  if (selectionPoint) return selectionPoint

  return {
    top: 24,
    left: Math.max(container.clientWidth - 24, 24),
  }
}

function isFocusableThoughtInvoker(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element) return false

  return Boolean(
    element.matches('button, a[href], input, select, textarea')
      || element.tabIndex >= 0,
  )
}

function buildThoughtBlockCandidates(
  container: HTMLElement,
  quote: string,
): Array<{ block: HTMLElement; estimatedStartOffset: number }> {
  let normalizedCursor = 0

  return Array.from(container.querySelectorAll<HTMLElement>('.bn-block')).flatMap((block) => {
    const normalizedBlockText = normalizeThoughtOffsetText(block.textContent ?? '')
    if (!normalizedBlockText) return []

    const blockStartOffset = normalizedCursor === 0
      ? 0
      : normalizedCursor + 1
    const candidates: Array<{ block: HTMLElement; estimatedStartOffset: number }> = []
    let quoteIndex = normalizedBlockText.indexOf(quote)

    while (quoteIndex >= 0) {
      candidates.push({
        block,
        estimatedStartOffset: blockStartOffset + quoteIndex,
      })
      quoteIndex = normalizedBlockText.indexOf(quote, quoteIndex + 1)
    }

    normalizedCursor = blockStartOffset + normalizedBlockText.length
    return candidates
  })
}

function findThoughtJumpTarget(options: {
  container: HTMLElement
  markdown: string
  thought: ThoughtRecord
}): HTMLElement | null {
  const { container, markdown, thought } = options
  if (thought.anchor.type !== 'selection') return null

  const matchedAnchor = matchThoughtAnchor(thought.anchor, markdown)
  if (!matchedAnchor) return null

  const targetOffset = normalizeThoughtOffsetText(
    markdown.slice(0, matchedAnchor.startOffset),
  ).length
  const blockCandidates = buildThoughtBlockCandidates(container, thought.anchor.quote)
  if (blockCandidates.length === 0) return null

  return blockCandidates
    .sort((left, right) => (
      Math.abs(left.estimatedStartOffset - targetOffset)
      - Math.abs(right.estimatedStartOffset - targetOffset)
    ))[0]?.block ?? null
}

const TITLE_HEADING_SELECTOR = 'h1, [data-content-type="heading"][data-level="1"], [data-content-type="heading"]:not([data-level])'
const TITLE_HEADING_WRAPPER_SELECTOR = '.bn-block-outer, .bn-block'
const CODE_BLOCK_SELECTOR = '[data-content-type="codeBlock"]'
const CODE_BLOCK_COPY_RESET_MS = 1200

function nodeElement(node: Node | null): HTMLElement | null {
  if (!node) return null
  if (node instanceof HTMLElement) return node
  return node.parentElement
}

function hasSingleActiveRange(selection: Selection | null): selection is Selection {
  return Boolean(selection && selection.rangeCount === 1 && !selection.isCollapsed)
}

function closestCodeBlockInContainer(options: {
  range: Range
  container: HTMLElement
}): HTMLElement | null {
  const { range, container } = options
  const codeBlock = nodeElement(range.commonAncestorContainer)
    ?.closest<HTMLElement>(CODE_BLOCK_SELECTOR)

  return codeBlock && container.contains(codeBlock) ? codeBlock : null
}

function nodeBelongsToElement(node: Node, element: HTMLElement): boolean {
  const elementNode = nodeElement(node)
  return Boolean(elementNode && element.contains(elementNode))
}

function rangeBelongsToElement(range: Range, element: HTMLElement): boolean {
  return nodeBelongsToElement(range.startContainer, element)
    && nodeBelongsToElement(range.endContainer, element)
}

function selectedCodeBlockRange(options: {
  selection: Selection | null
  container: HTMLElement
}): Range | null {
  const { selection, container } = options
  if (!hasSingleActiveRange(selection)) return null

  const range = selection.getRangeAt(0)
  const codeBlock = closestCodeBlockInContainer({ range, container })
  if (!codeBlock || !rangeBelongsToElement(range, codeBlock)) return null

  return range
}

function selectedCodeBlockText(options: {
  selection: Selection | null
  container: HTMLElement
}): string | null {
  const range = selectedCodeBlockRange(options)
  if (!range) return null

  return options.selection?.toString() || range.cloneContents().textContent || ''
}

function codeBlockText(codeBlock: HTMLElement): string {
  const codeElement = codeBlock.querySelector<HTMLElement>('pre code')
  return codeElement?.textContent ?? ''
}

async function writeClipboardText(text: string): Promise<void> {
  if (isTauri()) {
    await invoke('copy_text_to_clipboard', { text })
    return
  }

  if (!navigator.clipboard?.writeText) {
    throw new Error('Clipboard API is unavailable')
  }

  await navigator.clipboard.writeText(text)
}

type CodeBlockCopyTarget = {
  codeBlock: HTMLElement
  left: number
  top: number
}

function codeBlockCopyTarget(codeBlock: HTMLElement, container: HTMLElement): CodeBlockCopyTarget {
  const codeBlockRect = codeBlock.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  return {
    codeBlock,
    left: codeBlockRect.right - containerRect.left + container.scrollLeft - 30,
    top: codeBlockRect.top - containerRect.top + container.scrollTop + 6,
  }
}

function sameCopyTarget(left: CodeBlockCopyTarget | null, right: CodeBlockCopyTarget): boolean {
  return Boolean(
    left
      && left.codeBlock === right.codeBlock
      && left.left === right.left
      && left.top === right.top,
  )
}

function useCodeBlockCopyTarget(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [copyTarget, setCopyTarget] = useState<CodeBlockCopyTarget | null>(null)

  const showCopyTarget = useCallback((codeBlock: HTMLElement) => {
    const container = containerRef.current
    if (!container || !container.contains(codeBlock)) return

    const nextTarget = codeBlockCopyTarget(codeBlock, container)
    setCopyTarget((previous) => sameCopyTarget(previous, nextTarget) ? previous : nextTarget)
  }, [containerRef])

  const updateFromEventTarget = useCallback((target: EventTarget | null) => {
    const container = containerRef.current
    if (!(target instanceof HTMLElement) || !container) return
    if (target.closest('[data-editor-code-copy]')) return

    const codeBlock = target.closest<HTMLElement>(CODE_BLOCK_SELECTOR)
    if (codeBlock && container.contains(codeBlock)) {
      showCopyTarget(codeBlock)
      return
    }

    setCopyTarget(null)
  }, [containerRef, showCopyTarget])

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    updateFromEventTarget(event.target)
  }, [updateFromEventTarget])

  const handleFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    updateFromEventTarget(event.target)
  }, [updateFromEventTarget])

  const clearCopyTarget = useCallback(() => setCopyTarget(null), [])

  return { clearCopyTarget, copyTarget, handleFocus, handleMouseMove }
}

function CodeBlockCopyButton({ copyTarget, locale }: { copyTarget: CodeBlockCopyTarget; locale: AppLocale }) {
  const [active, setActive] = useState(false)
  const resetTimerRef = useRef<number | null>(null)
  const t = useMemo(() => createTranslator(locale), [locale])
  const label = t('editor.codeBlock.copy')

  useEffect(() => () => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
  }, [])

  const handleCopy = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    void writeClipboardText(codeBlockText(copyTarget.codeBlock))
      .then(() => {
        trackEvent('code_block_copied')
        setActive(true)
        if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
        resetTimerRef.current = window.setTimeout(() => {
          setActive(false)
          resetTimerRef.current = null
        }, CODE_BLOCK_COPY_RESET_MS)
      })
      .catch((error) => {
        console.warn('[editor] Failed to copy code block:', error)
      })
  }, [copyTarget])

  const stopEditorMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return (
    <div
      className="editor__code-block-copy"
      contentEditable={false}
      data-editor-code-copy
      style={{ left: copyTarget.left, top: copyTarget.top }}
    >
      <ActionTooltip copy={{ label }} side="left" align="center">
        <Button
          aria-label={label}
          className="border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground focus-visible:bg-transparent focus-visible:text-foreground"
          data-editor-code-copy-button
          onBlur={() => setActive(false)}
          onClick={handleCopy}
          onFocus={() => setActive(true)}
          onMouseDown={stopEditorMouseDown}
          onMouseEnter={() => setActive(true)}
          onMouseLeave={() => setActive(false)}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Copy aria-hidden="true" className="size-6" weight={active ? 'fill' : 'regular'} />
        </Button>
      </ActionTooltip>
    </div>
  )
}

function findTitleHeadingElement(target: HTMLElement): HTMLElement | null {
  const directHeading = target.closest<HTMLElement>(TITLE_HEADING_SELECTOR)
  if (directHeading) return directHeading

  const titleWrapper = target.closest<HTMLElement>(TITLE_HEADING_WRAPPER_SELECTOR)
  return titleWrapper?.querySelector<HTMLElement>(TITLE_HEADING_SELECTOR) ?? null
}

function queueTitleHeadingCursorRepair(
  target: HTMLElement,
  editor: ReturnType<typeof useCreateBlockNote>,
): boolean {
  const titleHeading = findTitleHeadingElement(target)
  if (!titleHeading) return false

  queueMicrotask(() => {
    if (isSelectionInsideElement(titleHeading)) return

    const firstBlock = editor.document[0]
    if (firstBlock?.type !== 'heading') return

    try {
      editor.setTextCursorPosition(firstBlock.id, 'end')
    } catch {
      return
    }
    editor.focus()
  })

  return true
}

function useEditorContainerClickHandler(options: {
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
}) {
  const { editable, editor } = options

  return useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable) return
    const target = e.target as HTMLElement
    if (queueTitleHeadingCursorRepair(target, editor)) return
    if (shouldIgnoreContainerClick(target)) return
    const blocks = editor.document
    if (blocks.length > 0) {
      const targetBlock = findNearestTextCursorBlock(blocks, blocks.length - 1)
      if (targetBlock) {
        try {
          editor.setTextCursorPosition(targetBlock.id, 'end')
        } catch {
          // Ignore transient BlockNote selection errors and at least restore focus.
        }
      }
    }
    editor.focus()
  }, [editor, editable])
}

function useCompositionAwareEditorChange(options: {
  containerRef: React.RefObject<HTMLDivElement | null>
  onChange?: () => void
}) {
  const { containerRef, onChange } = options
  const onChangeRef = useRef(onChange)
  const composingRef = useRef(false)
  const pendingChangeRef = useRef(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const flushPendingChange = () => {
      if (composingRef.current || !pendingChangeRef.current) return
      pendingChangeRef.current = false
      onChangeRef.current?.()
    }

    const handleCompositionStart = () => {
      composingRef.current = true
    }

    const handleCompositionEnd = () => {
      composingRef.current = false
      queueMicrotask(flushPendingChange)
    }

    container.addEventListener('compositionstart', handleCompositionStart, true)
    container.addEventListener('compositionend', handleCompositionEnd, true)
    return () => {
      container.removeEventListener('compositionstart', handleCompositionStart, true)
      container.removeEventListener('compositionend', handleCompositionEnd, true)
    }
  }, [containerRef])

  return useCallback(() => {
    if (composingRef.current) {
      pendingChangeRef.current = true
      return
    }

    pendingChangeRef.current = false
    onChangeRef.current?.()
  }, [])
}

function findHighlightShortcutSurface(options: {
  container: HTMLElement
  editor: ReturnType<typeof useCreateBlockNote>
}) {
  const { container, editor } = options
  const editorElement = editor.domElement

  if (editorElement instanceof HTMLElement && editorElement.isConnected && container.contains(editorElement)) {
    if (editorElement.matches(EDITOR_EDITABLE_SELECTOR)) {
      return editorElement
    }

    const editableDescendant = editorElement.querySelector<HTMLElement>(EDITOR_EDITABLE_SELECTOR)
    if (editableDescendant) return editableDescendant
  }

  return container.querySelector<HTMLElement>(EDITOR_EDITABLE_SELECTOR)
}

function shouldIgnoreHighlightShortcutTarget(options: {
  editableSurface: HTMLElement
  target: EventTarget | null
}) {
  const { editableSurface, target } = options
  if (!(target instanceof Node)) return true

  const targetElement = nodeElement(target)
  if (!targetElement || !editableSurface.contains(targetElement)) return true

  return Boolean(targetElement.closest(EDITOR_SHORTCUT_IGNORE_SELECTOR))
}

function useEditorHighlightShortcut(options: {
  containerRef: React.RefObject<HTMLDivElement | null>
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
}) {
  const { containerRef, editable, editor } = options

  useEffect(() => {
    if (!editable) return

    const container = containerRef.current
    if (!container) return
    const editableSurface = findHighlightShortcutSurface({ container, editor })
    if (!editableSurface) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (!isHighlightShortcut(event)) return
      if (shouldIgnoreHighlightShortcutTarget({
        editableSurface,
        target: event.target,
      })) return

      event.preventDefault()
      editor.focus()
      editor.toggleStyles({ highlight: true } as never)
    }

    editableSurface.addEventListener('keydown', handleKeyDown, true)
    return () => {
      editableSurface.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [containerRef, editable, editor])
}

function useHighlightJumpListener(options: {
  activeNotePath?: string
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const { activeNotePath, containerRef } = options
  const pulseTimeoutRef = useRef<number | null>(null)
  const pulsingElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current)
      }
      pulsingElementRef.current?.classList.remove(HIGHLIGHT_PULSE_CLASS)
    }
  }, [])

  useEffect(() => {
    if (!activeNotePath) return

    const handleJump = (event: Event) => {
      const detail = (event as CustomEvent<HighlightJumpEventDetail>).detail
      const highlight = detail?.highlight
      if (!highlight || highlight.notePath !== activeNotePath) return

      const container = containerRef.current
      if (!container) return

      const targetExcerpt = normalizeHighlightText(highlight.excerpt)
      if (!targetExcerpt) return

      const target = Array.from(container.querySelectorAll<HTMLElement>('.tolaria-highlight'))
        .find((element) => normalizeHighlightText(element.textContent ?? '') === targetExcerpt)
      if (!target) return

      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current)
      }
      pulsingElementRef.current?.classList.remove(HIGHLIGHT_PULSE_CLASS)

      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.classList.add(HIGHLIGHT_PULSE_CLASS)
      pulsingElementRef.current = target
      pulseTimeoutRef.current = window.setTimeout(() => {
        target.classList.remove(HIGHLIGHT_PULSE_CLASS)
        if (pulsingElementRef.current === target) {
          pulsingElementRef.current = null
        }
        pulseTimeoutRef.current = null
      }, 1400)
    }

    window.addEventListener(HIGHLIGHT_JUMP_EVENT, handleJump)
    return () => {
      window.removeEventListener(HIGHLIGHT_JUMP_EVENT, handleJump)
    }
  }, [activeNotePath, containerRef])
}

function useThoughtJumpListener(options: {
  activeNotePath?: string
  activeMarkdown?: string
  thoughts: ThoughtRecord[]
  containerRef: React.RefObject<HTMLDivElement | null>
  onOpenThought: (thought: ThoughtRecord, anchorElement?: HTMLElement | null) => void
  onThoughtJumpHandled?: (thoughtId: string) => void
  onThoughtError?: (message: string) => void
  pendingThoughtJump?: ThoughtRecord | null
}) {
  const {
    activeNotePath,
    activeMarkdown,
    thoughts,
    containerRef,
    onOpenThought,
    onThoughtJumpHandled,
    onThoughtError,
    pendingThoughtJump,
  } = options
  const pulseTimeoutRef = useRef<number | null>(null)
  const pulsingElementRef = useRef<HTMLElement | null>(null)
  const ignoreNextThoughtEventIdRef = useRef<string | null>(null)
  const pendingThoughtJumpRef = useRef(pendingThoughtJump)

  useEffect(() => {
    pendingThoughtJumpRef.current = pendingThoughtJump
  }, [pendingThoughtJump])

  const pulseElement = useCallback((target: HTMLElement) => {
    if (pulseTimeoutRef.current !== null) {
      window.clearTimeout(pulseTimeoutRef.current)
    }
    pulsingElementRef.current?.classList.remove(THOUGHT_PULSE_CLASS)

    target.classList.add(THOUGHT_PULSE_CLASS)
    pulsingElementRef.current = target
    pulseTimeoutRef.current = window.setTimeout(() => {
      target.classList.remove(THOUGHT_PULSE_CLASS)
      if (pulsingElementRef.current === target) {
        pulsingElementRef.current = null
      }
      pulseTimeoutRef.current = null
    }, THOUGHT_PULSE_DURATION_MS)
  }, [])

  const handleThoughtJump = useCallback((thought: ThoughtRecord, source: 'event' | 'pending') => {
    if (!activeNotePath || thought.notePath !== activeNotePath) return false

    const container = containerRef.current
    if (!container) return false

    if (source === 'pending') {
      ignoreNextThoughtEventIdRef.current = thought.id
    }

    if (thought.anchor.type === 'article') {
      const scrollContainer = resolveThoughtScrollContainer(container)
      if (typeof scrollContainer.scrollTo === 'function') {
        scrollContainer.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        scrollContainer.scrollTop = 0
      }
      onOpenThought(thought, container)
      onThoughtJumpHandled?.(thought.id)
      return true
    }

    const anchorQuote = thought.anchor.type === 'selection' ? thought.anchor.quote : ''
    const target = activeMarkdown
      ? findThoughtJumpTarget({
          container,
          markdown: activeMarkdown,
          thought,
        })
      : Array.from(container.querySelectorAll<HTMLElement>('.bn-block'))
        .find((element) => element.textContent?.includes(anchorQuote))
    if (!target) {
      if (source === 'event') {
        onThoughtError?.('Thought anchor could not be found in this note.')
        onThoughtJumpHandled?.(thought.id)
      }
      return false
    }

    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    pulseElement(target)
    onOpenThought(thought, target)
    onThoughtJumpHandled?.(thought.id)
    return true
  }, [activeMarkdown, activeNotePath, containerRef, onOpenThought, onThoughtError, onThoughtJumpHandled, pulseElement])

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current !== null) {
        window.clearTimeout(pulseTimeoutRef.current)
      }
      pulsingElementRef.current?.classList.remove(THOUGHT_PULSE_CLASS)
      const pendingThought = pendingThoughtJumpRef.current
      if (pendingThought) {
        window.setTimeout(() => {
          onThoughtJumpHandled?.(pendingThought.id)
        }, 600)
      }
    }
  }, [onThoughtJumpHandled])

  useEffect(() => {
    if (!pendingThoughtJump || !activeNotePath) return
    if (pendingThoughtJump.notePath === activeNotePath) return

    onThoughtJumpHandled?.(pendingThoughtJump.id)
  }, [activeNotePath, onThoughtJumpHandled, pendingThoughtJump])

  useEffect(() => {
    if (!pendingThoughtJump) return
    if (!thoughts.some((thought) => thought.id === pendingThoughtJump.id)) return

    let cancelled = false
    let timeoutId: number | null = null
    let attempts = 0
    const maxAttempts = 8

    const tryPendingJump = () => {
      if (cancelled) return

      if (handleThoughtJump(pendingThoughtJump, 'pending')) return
      attempts += 1
      if (attempts >= maxAttempts) {
        handleThoughtJump(pendingThoughtJump, 'event')
        return
      }

      timeoutId = window.setTimeout(tryPendingJump, 50)
    }

    tryPendingJump()
    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [handleThoughtJump, pendingThoughtJump, thoughts])

  useEffect(() => {
    const handleJump = (event: Event) => {
      const detail = (event as CustomEvent<ThoughtJumpEventDetail>).detail
      const thought = detail?.thought
      if (!thought) return
      if (ignoreNextThoughtEventIdRef.current === thought.id) {
        ignoreNextThoughtEventIdRef.current = null
        return
      }

      handleThoughtJump(thought, 'event')
    }

    window.addEventListener(THOUGHT_JUMP_EVENT, handleJump)
    return () => {
      window.removeEventListener(THOUGHT_JUMP_EVENT, handleJump)
    }
  }, [handleThoughtJump])
}

function handleCodeBlockCopy(event: React.ClipboardEvent<HTMLDivElement>) {
  const codeText = selectedCodeBlockText({
    selection: window.getSelection(),
    container: event.currentTarget,
  })
  if (codeText === null) return

  event.clipboardData.setData('text/plain', codeText)
  event.preventDefault()
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function markdownStem(value: string): string {
  return value.replace(/\.md$/i, '')
}

function pathStem(path: string): string {
  return markdownStem(path.split('/').pop() ?? path)
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => nonEmptyString(item) !== null)
    : []
}

function buildBaseSuggestionItems(entries: VaultEntry[]) {
  return deduplicateByPath(entries.flatMap(entry => {
    const path = nonEmptyString(entry.path)
    if (!path) return []

    const filename = nonEmptyString(entry.filename)
    const filenameStem = filename ? markdownStem(filename) : pathStem(path)
    const title = nonEmptyString(entry.title) ?? filenameStem
    const entryType = nonEmptyString(entry.isA)
    return [{
      title,
      aliases: [...new Set([filenameStem, ...safeStringArray(entry.aliases)])],
      group: entryType ?? 'Note',
      entryType,
      entryTitle: title,
      path,
    }]
  }))
}

function useInsertWikilink(
  editor: ReturnType<typeof useCreateBlockNote>,
  runEditorAction: (action: SuggestionAction) => void,
) {
  return useCallback((target: string) => {
    runEditorAction(() => {
      editor.insertInlineContent([
        { type: 'wikilink' as const, props: { target } },
        " ",
      ], { updateSelection: true })
      trackEvent('wikilink_inserted')
    })
  }, [editor, runEditorAction])
}

function useSuggestionMenuItems(options: {
  baseItems: ReturnType<typeof buildBaseSuggestionItems>
  editor: ReturnType<typeof useCreateBlockNote>
  insertWikilink: (target: string) => void
  runEditorAction: (action: SuggestionAction) => void
  typeEntryMap: Record<string, VaultEntry>
  vaultPath?: string
}) {
  const {
    baseItems,
    editor,
    insertWikilink,
    runEditorAction,
    typeEntryMap,
    vaultPath,
  } = options

  const buildItems = useCallback((query: string, triggerCharacter: '[[' | '@') => {
    const normalizedQuery = normalizeSuggestionQuery(query, triggerCharacter)
    const minLength = triggerCharacter === '[[' ? MIN_QUERY_LENGTH : PERSON_MENTION_MIN_QUERY
    if (normalizedQuery.length < minLength) return null

    const candidates = triggerCharacter === '[['
      ? preFilterWikilinks(baseItems, normalizedQuery)
      : filterPersonMentions(baseItems, normalizedQuery)

    const items = attachClickHandlers(candidates, insertWikilink, vaultPath ?? '')
    return guardSuggestionMenuItems(
      enrichSuggestionItems(items, normalizedQuery, typeEntryMap),
      runEditorAction,
    )
  }, [baseItems, insertWikilink, runEditorAction, typeEntryMap, vaultPath])

  const getWikilinkItems = useCallback(async (query: string): Promise<WikilinkSuggestionItem[]> => (
    buildItems(query, '[[') ?? []
  ), [buildItems])

  const getPersonMentionItems = useCallback(async (query: string): Promise<WikilinkSuggestionItem[]> => (
    buildItems(query, '@') ?? []
  ), [buildItems])

  const getSlashMenuItems = useCallback(async (query: string) => {
    try {
      return guardSuggestionMenuItems(
        await Promise.resolve(getTolariaSlashMenuItems(editor, query)),
        runEditorAction,
      )
    } catch (error) {
      console.warn('[editor] Ignored stale slash menu query:', error)
      return []
    }
  }, [editor, runEditorAction])

  return {
    getWikilinkItems,
    getPersonMentionItems,
    getSlashMenuItems,
  }
}

type EditorInteractionControllersProps = ReturnType<typeof useSuggestionMenuItems> & {
  runEditorAction: (action: SuggestionAction) => void
}

function EditorInteractionControllers({
  getPersonMentionItems,
  getSlashMenuItems,
  getWikilinkItems,
  runEditorAction,
}: EditorInteractionControllersProps) {
  return (
    <>
      <SideMenuController sideMenu={TolariaSideMenu} />
      <TolariaFormattingToolbarController
        formattingToolbar={TolariaFormattingToolbar}
        floatingUIOptions={{
          elementProps: {
            onMouseDownCapture: handleToolbarMouseDownCapture,
          },
        }}
      />
      <LinkToolbarController
        linkToolbar={TolariaLinkToolbar}
        floatingUIOptions={{
          elementProps: {
            onMouseDownCapture: handleToolbarMouseDownCapture,
          },
        }}
      />
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={getSlashMenuItems}
      />
      <SuggestionMenuController
        triggerCharacter="[["
        getItems={getWikilinkItems}
        suggestionMenuComponent={WikilinkSuggestionMenu}
        onItemClick={(item: WikilinkSuggestionItem) => runEditorAction(item.onItemClick)}
      />
      <SuggestionMenuController
        triggerCharacter="@"
        getItems={getPersonMentionItems}
        suggestionMenuComponent={WikilinkSuggestionMenu}
        onItemClick={(item: WikilinkSuggestionItem) => runEditorAction(item.onItemClick)}
      />
    </>
  )
}

/** Insert an image block after the current cursor position. */
function useInsertImageCallback(editor: ReturnType<typeof useCreateBlockNote>) {
  const editorRef = useRef(editor)
  useEffect(() => { editorRef.current = editor }, [editor])
  return useCallback((url: string) => {
    const e = editorRef.current
    const cursorBlock = e.getTextCursorPosition().block
    e.insertBlocks([{ type: 'image' as const, props: { url } }], cursorBlock, 'after')
  }, [])
}

function resolveThoughtAnchorLabel(thought: ThoughtRecord | null): string {
  if (!thought) return 'Whole article'
  return thought.anchor.type === 'selection'
    ? thought.anchor.quote
    : 'Whole article'
}

function useRichEditorPlainTextPasteTarget(options: {
  containerRef: React.RefObject<HTMLDivElement | null>
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  runEditorAction: (action: SuggestionAction) => void
}) {
  const { containerRef, editable, editor, runEditorAction } = options
  const targetRef = useRef<PlainTextPasteTarget | null>(null)

  useEffect(() => {
    const target: PlainTextPasteTarget = {
      surface: 'rich_editor',
      contains: (element) => Boolean(element && containerRef.current?.contains(element)),
      isConnected: () => containerRef.current?.isConnected === true,
      insert: (text) => {
        if (!editable) return false

        let inserted = false
        runEditorAction(() => {
          editor.focus()
          editor.insertInlineContent(text, { updateSelection: true })
          inserted = true
        })
        return inserted
      },
    }
    targetRef.current = target
    const unregister = registerPlainTextPasteTarget(target)

    return () => {
      unregister()
      if (targetRef.current === target) {
        targetRef.current = null
      }
    }
  }, [containerRef, editable, editor, runEditorAction])

  return useCallback(() => {
    if (targetRef.current) {
      activatePlainTextPasteTarget(targetRef.current)
    }
  }, [])
}

/** Single BlockNote editor view — content is swapped via replaceBlocks */
export function SingleEditorView({
  editor,
  entries,
  activeNotePath,
  activeMarkdown,
  thoughts = [],
  onNavigateWikilink,
  onChange,
  vaultPath,
  editable = true,
  onSaveThought,
  onDeleteThought,
  pendingThoughtJump,
  onThoughtJumpHandled,
  onThoughtError,
  locale = 'en',
}: {
  editor: ReturnType<typeof useCreateBlockNote>
  entries: VaultEntry[]
  activeNotePath?: string
  activeMarkdown?: string
  thoughts?: ThoughtRecord[]
  onNavigateWikilink: (target: string) => void
  onChange?: () => void
  vaultPath?: string
  editable?: boolean
  onSaveThought?: (thought: ThoughtRecord) => Promise<ThoughtRecord>
  onDeleteThought?: (thought: ThoughtRecord) => Promise<void>
  pendingThoughtJump?: ThoughtRecord | null
  onThoughtJumpHandled?: (thoughtId: string) => void
  onThoughtError?: (message: string) => void
  locale?: AppLocale
}) {
  const { cssVars } = useEditorTheme()
  const themeMode = useDocumentThemeMode()
  const containerRef = useRef<HTMLDivElement>(null)
  const thoughtInvokerFocusRef = useRef<HTMLElement | null>(null)
  const [draftThought, setDraftThought] = useState<ThoughtRecord | null>(null)
  const [openThought, setOpenThought] = useState<ThoughtRecord | null>(null)
  const [thoughtPopoverOpen, setThoughtPopoverOpen] = useState(false)
  const [thoughtPopoverAnchor, setThoughtPopoverAnchor] = useState<ThoughtPopoverAnchorPoint | null>(null)
  const handleContainerClick = useEditorContainerClickHandler({ editable, editor })
  const handleEditorChange = useCompositionAwareEditorChange({ containerRef, onChange })
  const onImageUrl = useInsertImageCallback(editor)
  const { isDragOver } = useImageDrop({ containerRef, onImageUrl, vaultPath })
  const lightbox = useImageLightbox({ containerRef })
  const {
    clearCopyTarget,
    copyTarget,
    handleFocus: handleCodeBlockCopyFocus,
    handleMouseMove: handleCodeBlockCopyMouseMove,
  } = useCodeBlockCopyTarget(containerRef)
  useBlockNoteSideMenuHoverGuard(containerRef)
  useEditorLinkActivation(containerRef, onNavigateWikilink)
  useEditorHighlightShortcut({ containerRef, editable, editor })
  useHighlightJumpListener({ activeNotePath, containerRef })

  useEffect(() => {
    _wikilinkEntriesRef.current = entries
  }, [entries])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    return observeNativeTextAssistanceDisabled(container)
  }, [])

  useSeedBlockNoteTableBridge(editor)

  const typeEntryMap = useMemo(() => buildTypeEntryMap(entries), [entries])
  const baseItems = useMemo(() => buildBaseSuggestionItems(entries), [entries])
  const runEditorAction = useCallback((action: SuggestionAction) => {
    runSuggestionActionSafely({
      action,
      container: containerRef.current,
      editor,
    })
  }, [editor])
  const activatePlainTextPaste = useRichEditorPlainTextPasteTarget({
    containerRef,
    editable,
    editor,
    runEditorAction,
  })
  const handleFocusCapture = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    activatePlainTextPaste()
    handleCodeBlockCopyFocus(event)
  }, [activatePlainTextPaste, handleCodeBlockCopyFocus])
  const insertWikilink = useInsertWikilink(editor, runEditorAction)
  const suggestionMenuItems = useSuggestionMenuItems({
    baseItems,
    editor,
    insertWikilink,
    runEditorAction,
    typeEntryMap,
    vaultPath,
  })
  const activeThoughts = useMemo(
    () => thoughts.filter((thought) => thought.notePath === activeNotePath),
    [activeNotePath, thoughts],
  )
  const activeEntry = useMemo(
    () => entries.find((entry) => entry.path === activeNotePath) ?? null,
    [activeNotePath, entries],
  )
  const restoreThoughtFocus = useCallback(() => {
    const thoughtInvoker = thoughtInvokerFocusRef.current
    thoughtInvokerFocusRef.current = null

    if (thoughtInvoker?.isConnected) {
      thoughtInvoker.focus()
      return
    }

    editor.focus()
  }, [editor])
  const openThoughtPopover = useCallback((thought: ThoughtRecord, anchorElement?: HTMLElement | null) => {
    const container = containerRef.current
    if (container) {
      setThoughtPopoverAnchor(
        resolveThoughtPopoverAnchorPoint({
          container,
          anchorElement,
        }),
      )
    }
    thoughtInvokerFocusRef.current = isFocusableThoughtInvoker(anchorElement)
      ? anchorElement
      : null
    setDraftThought(null)
    setOpenThought(thought)
    setThoughtPopoverOpen(true)
  }, [])
  const createThoughtFromSelection = useCallback(() => {
    if (!editable) return
    if (!activeNotePath || !activeEntry) return

    const container = containerRef.current
    if (!container) return

    const selectedText = getSelectedTextInsideElement(container)
    const markdown = activeMarkdown ?? ''
    const thought = selectedText
      ? createSelectionThoughtDraft({
          notePath: activeNotePath,
          noteTitle: activeEntry.title,
          selectedText,
          markdown,
          bodyMarkdown: ' ',
        })
      : createArticleThoughtDraft({
          notePath: activeNotePath,
          noteTitle: activeEntry.title,
          bodyMarkdown: ' ',
        })

    setThoughtPopoverAnchor(
      resolveThoughtPopoverAnchorPoint({
        container,
      }),
    )
    thoughtInvokerFocusRef.current = null
    setOpenThought(null)
    setDraftThought(thought)
    setThoughtPopoverOpen(true)
  }, [activeEntry, activeMarkdown, activeNotePath, editable])

  useThoughtJumpListener({
    activeNotePath,
    activeMarkdown,
    thoughts: activeThoughts,
    containerRef,
    onOpenThought: openThoughtPopover,
    onThoughtJumpHandled,
    onThoughtError,
    pendingThoughtJump,
  })

  useEffect(() => {
    if (!editable) return

    const handleAddThought = () => {
      createThoughtFromSelection()
    }

    window.addEventListener(ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT, handleAddThought)
    return () => {
      window.removeEventListener(ADD_THOUGHT_FROM_FORMATTING_TOOLBAR_EVENT, handleAddThought)
    }
  }, [createThoughtFromSelection, editable])

  const displayedThought = openThought ?? draftThought
  const thoughtAnchorLabel = resolveThoughtAnchorLabel(displayedThought)

  return (
    <div
      ref={containerRef}
      className={`editor__blocknote-container${isDragOver ? ' editor__blocknote-container--drag-over' : ''}`}
      style={cssVars as React.CSSProperties}
      onClick={handleContainerClick}
      onCopyCapture={handleCodeBlockCopy}
      onFocusCapture={handleFocusCapture}
      onMouseLeave={clearCopyTarget}
      onMouseDownCapture={activatePlainTextPaste}
      onMouseMove={handleCodeBlockCopyMouseMove}
    >
      {activeNotePath && activeMarkdown && (
        <ThoughtPinsLayer
          thoughts={activeThoughts}
          markdown={activeMarkdown}
          onOpenThought={openThoughtPopover}
        />
      )}
      <ThoughtPopover
        open={thoughtPopoverOpen}
        anchorLabel={thoughtAnchorLabel}
        thought={displayedThought}
        initialBody={draftThought?.bodyMarkdown}
        anchor={thoughtPopoverAnchor
          ? (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: `${thoughtPopoverAnchor.top}px`,
                  left: `${thoughtPopoverAnchor.left}px`,
                  width: '1px',
                  height: '1px',
                  pointerEvents: 'none',
                }}
              />
            )
          : undefined}
        onOpenChange={(open) => {
          setThoughtPopoverOpen(open)
          if (!open) {
            setThoughtPopoverAnchor(null)
            setDraftThought(null)
            setOpenThought(null)
          }
        }}
        onCloseAutoFocus={restoreThoughtFocus}
        onSave={async (bodyMarkdown) => {
          const thoughtToSave = displayedThought
          if (!thoughtToSave) return
          if (!onSaveThought) {
            onThoughtError?.('Thoughts could not be saved right now.')
            return
          }

          const timestamp = new Date().toISOString()
          const nextThought: ThoughtRecord = {
            ...thoughtToSave,
            bodyMarkdown,
            createdAt: thoughtToSave.createdAt || timestamp,
            updatedAt: timestamp,
          }

          try {
            await onSaveThought(nextThought)
            setDraftThought(null)
            setOpenThought(null)
          } catch (error) {
            onThoughtError?.(thoughtErrorMessage(error, 'Thought could not be saved.'))
            throw error
          }
        }}
        onDelete={displayedThought && openThought && onDeleteThought
          ? async () => {
              try {
                await onDeleteThought(openThought)
                setOpenThought(null)
                setDraftThought(null)
              } catch (error) {
                onThoughtError?.(thoughtErrorMessage(error, 'Thought could not be deleted.'))
                throw error
              }
            }
          : undefined}
      />
      {isDragOver && (
        <div className="editor__drop-overlay">
          <div className="editor__drop-overlay-label">Drop image here</div>
        </div>
      )}
      <SharedContextBlockNoteView
        editor={editor}
        theme={themeMode}
        onChange={handleEditorChange}
        editable={editable}
        formattingToolbar={false}
        linkToolbar={false}
        slashMenu={false}
        sideMenu={false}
      >
        <EditorInteractionControllers
          {...suggestionMenuItems}
          runEditorAction={runEditorAction}
        />
      </SharedContextBlockNoteView>
      {copyTarget && <CodeBlockCopyButton copyTarget={copyTarget} locale={locale} />}
      <ImageLightbox image={lightbox.image} locale={locale} onClose={lightbox.close} />
    </div>
  )
}
