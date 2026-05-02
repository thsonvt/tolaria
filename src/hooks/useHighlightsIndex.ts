import { useEffect, useMemo, useState } from 'react'
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

function isIndexableMarkdownEntry(entry: VaultEntry): boolean {
  return !entry.archived && (entry.fileKind ?? 'markdown') === 'markdown'
}

const EMPTY_STATE: HighlightsIndexState = {
  groups: [],
  highlights: [],
  loading: false,
  error: null,
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
  const [state, setState] = useState<HighlightsIndexState>(EMPTY_STATE)

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
        const openContent = openTabContentByPath[entry.path]
        const content = openContent ?? await invoke<string>('get_note_content', {
          path: entry.path,
          vaultPath: vaultPath ?? undefined,
        })
        highlights.push(...parseEntryHighlights(entry, content))
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
  }, [enabled, indexableEntries, openTabContentByPath, vaultPath])

  return state
}

export { filterHighlightGroups }
export type { HighlightExcerpt, HighlightGroup }
