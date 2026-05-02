import { useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { VaultEntry } from '../types'
import {
  buildHighlightGroups,
  filterHighlightGroups,
  parseEntryHighlights,
  type HighlightExcerpt,
  type HighlightGroup,
} from '../utils/highlightMarkdown'

interface UseHighlightsIndexOptions {
  entries: VaultEntry[]
  enabled: boolean
  vaultPath?: string | null
  openTabContentByPath: Record<string, string>
}

interface HighlightsIndexState {
  groups: HighlightGroup[]
  highlights: HighlightExcerpt[]
  loading: boolean
  error: string | null
}

interface HighlightsCacheEntry {
  signature: string
  highlights: HighlightExcerpt[]
}

function isIndexableMarkdownEntry(entry: VaultEntry): boolean {
  return !entry.archived && (entry.fileKind ?? 'markdown') === 'markdown'
}

const EMPTY_STATE: HighlightsIndexState = {
  groups: [],
  highlights: [],
  loading: false,
  error: null,
}

function buildDiskEntrySignature(entry: VaultEntry): string {
  return [
    'disk',
    entry.path,
    entry.modifiedAt ?? '',
    entry.createdAt ?? '',
    entry.fileSize,
  ].join(':')
}

function buildOpenEntrySignature(entry: VaultEntry, content: string): string {
  return [
    'open',
    entry.path,
    content.length,
    content,
  ].join(':')
}

function buildRelevantOpenTabSnapshot(
  entries: VaultEntry[],
  openTabContentByPath: Record<string, string>,
): { contentByPath: Record<string, string>; key: string } {
  const contentByPath: Record<string, string> = {}
  const keyParts: string[] = []

  for (const entry of entries) {
    const content = openTabContentByPath[entry.path]
    if (content === undefined) continue

    contentByPath[entry.path] = content
    keyParts.push(`${entry.path.length}:${entry.path}:${content.length}:${content}`)
  }

  return {
    contentByPath,
    key: keyParts.join('\u0000'),
  }
}

export function useHighlightsIndex({
  entries,
  enabled,
  vaultPath,
  openTabContentByPath,
}: UseHighlightsIndexOptions): HighlightsIndexState {
  const indexableEntries = useMemo(
    () => entries.filter(isIndexableMarkdownEntry),
    [entries],
  )
  const relevantOpenTabSnapshot = useMemo(
    () => buildRelevantOpenTabSnapshot(indexableEntries, openTabContentByPath),
    [indexableEntries, openTabContentByPath],
  )
  const relevantOpenTabContentKey = relevantOpenTabSnapshot.key
  const relevantOpenTabContentByPath = useMemo(
    () => relevantOpenTabSnapshot.contentByPath,
    [relevantOpenTabContentKey],
  )
  const [state, setState] = useState<HighlightsIndexState>(EMPTY_STATE)
  const cacheRef = useRef<Map<string, HighlightsCacheEntry>>(new Map())

  useEffect(() => {
    if (!enabled) {
      setState(EMPTY_STATE)
      return
    }

    let cancelled = false
    setState((current) => ({ ...current, loading: true, error: null }))

    async function buildIndex() {
      const highlights: HighlightExcerpt[] = []

      for (const entry of indexableEntries) {
        if (cancelled) return

        const openContent = relevantOpenTabContentByPath[entry.path]
        const signature = openContent !== undefined
          ? buildOpenEntrySignature(entry, openContent)
          : buildDiskEntrySignature(entry)
        const cached = cacheRef.current.get(entry.path)

        if (cached?.signature === signature) {
          highlights.push(...cached.highlights)
          continue
        }

        if (openContent !== undefined) {
          const parsedHighlights = parseEntryHighlights(entry, openContent)
          cacheRef.current.set(entry.path, {
            signature,
            highlights: parsedHighlights,
          })
          highlights.push(...parsedHighlights)
          continue
        }

        const content = await invoke<string>('get_note_content', {
          path: entry.path,
          vaultPath: vaultPath ?? undefined,
        })

        if (cancelled) return

        const parsedHighlights = parseEntryHighlights(entry, content)
        cacheRef.current.set(entry.path, {
          signature,
          highlights: parsedHighlights,
        })
        highlights.push(...parsedHighlights)
      }

      if (cancelled) return

      setState({
        groups: buildHighlightGroups(
          highlights,
          indexableEntries.map((entry) => entry.path),
        ),
        highlights,
        loading: false,
        error: null,
      })
    }

    void buildIndex().catch((error: unknown) => {
      if (cancelled) return

      setState({
        groups: [],
        highlights: [],
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      })
    })

    return () => {
      cancelled = true
    }
  }, [enabled, indexableEntries, relevantOpenTabContentByPath, relevantOpenTabContentKey, vaultPath])

  return state
}

export { filterHighlightGroups }
export type { HighlightExcerpt, HighlightGroup }
