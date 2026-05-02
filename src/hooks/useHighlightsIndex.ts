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

interface HighlightEntryDescriptor {
  entry: VaultEntry
  path: string
  signature: string
  source: 'open' | 'disk'
  openContent?: string
}

interface HighlightsIndexMeta {
  orderedPathsKey: string
  signatures: Map<string, string>
  vaultPath: string | null
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
    entry.title,
    entry.modifiedAt ?? '',
    entry.createdAt ?? '',
    entry.fileSize,
  ].join(':')
}

function buildOpenEntrySignature(entry: VaultEntry, content: string): string {
  return [
    'open',
    entry.path,
    entry.title,
    content.length,
    content,
  ].join(':')
}

function buildEntryDescriptors(
  entries: VaultEntry[],
  openTabContentByPath: Record<string, string>,
): HighlightEntryDescriptor[] {
  return entries.map((entry) => {
    const openContent = openTabContentByPath[entry.path]
    if (openContent !== undefined) {
      return {
        entry,
        path: entry.path,
        signature: buildOpenEntrySignature(entry, openContent),
        source: 'open',
        openContent,
      }
    }

    return {
      entry,
      path: entry.path,
      signature: buildDiskEntrySignature(entry),
      source: 'disk',
    }
  })
}

function buildStateFromCache(
  descriptors: HighlightEntryDescriptor[],
  cache: Map<string, HighlightsCacheEntry>,
): HighlightsIndexState {
  const highlights = descriptors.flatMap((descriptor) => (
    cache.get(descriptor.path)?.highlights ?? []
  ))

  return {
    groups: buildHighlightGroups(
      highlights,
      descriptors.map((descriptor) => descriptor.path),
    ),
    highlights,
    loading: false,
    error: null,
  }
}

function buildMeta(
  descriptors: HighlightEntryDescriptor[],
  vaultPath: string | null,
): HighlightsIndexMeta {
  return {
    orderedPathsKey: descriptors.map((descriptor) => descriptor.path).join('\u0000'),
    signatures: new Map(descriptors.map((descriptor) => [descriptor.path, descriptor.signature])),
    vaultPath,
  }
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
  const normalizedVaultPath = vaultPath ?? null
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
  const entryDescriptors = useMemo(
    () => buildEntryDescriptors(indexableEntries, relevantOpenTabContentByPath),
    [indexableEntries, relevantOpenTabContentByPath],
  )
  const [state, setState] = useState<HighlightsIndexState>(EMPTY_STATE)
  const cacheRef = useRef<Map<string, HighlightsCacheEntry>>(new Map())
  const metaRef = useRef<HighlightsIndexMeta | null>(null)

  useEffect(() => {
    if (!enabled) {
      cacheRef.current.clear()
      metaRef.current = null
      setState(EMPTY_STATE)
      return
    }

    let cancelled = false
    const previousMeta = metaRef.current
    const currentPaths = new Set(entryDescriptors.map((descriptor) => descriptor.path))

    for (const path of cacheRef.current.keys()) {
      if (!currentPaths.has(path)) {
        cacheRef.current.delete(path)
      }
    }

    const nextMeta = buildMeta(entryDescriptors, normalizedVaultPath)
    const changedDescriptors = entryDescriptors.filter((descriptor) => (
      previousMeta === null
        || previousMeta.vaultPath !== normalizedVaultPath
        || previousMeta.signatures.get(descriptor.path) !== descriptor.signature
    ))

    if (changedDescriptors.length === 0) {
      const orderChanged = previousMeta?.orderedPathsKey !== nextMeta.orderedPathsKey
      if (orderChanged) {
        setState(buildStateFromCache(entryDescriptors, cacheRef.current))
      }
      metaRef.current = nextMeta
      return
    }

    for (const descriptor of changedDescriptors) {
      if (descriptor.source !== 'open') continue

      const parsedHighlights = parseEntryHighlights(descriptor.entry, descriptor.openContent ?? '')
      cacheRef.current.set(descriptor.path, {
        signature: descriptor.signature,
        highlights: parsedHighlights,
      })
    }

    const diskDescriptors = changedDescriptors.filter((descriptor) => descriptor.source === 'disk')
    if (diskDescriptors.length === 0) {
      metaRef.current = nextMeta
      setState(buildStateFromCache(entryDescriptors, cacheRef.current))
      return
    }

    setState((current) => ({ ...current, loading: true, error: null }))

    async function loadChangedDiskEntries() {
      for (const descriptor of diskDescriptors) {
        if (cancelled) return

        const content = await invoke<string>('get_note_content', {
          path: descriptor.path,
          vaultPath: normalizedVaultPath ?? undefined,
        })

        if (cancelled) return

        const parsedHighlights = parseEntryHighlights(descriptor.entry, content)
        cacheRef.current.set(descriptor.path, {
          signature: descriptor.signature,
          highlights: parsedHighlights,
        })
      }

      if (cancelled) return

      metaRef.current = nextMeta
      setState(buildStateFromCache(entryDescriptors, cacheRef.current))
    }

    void loadChangedDiskEntries().catch((error: unknown) => {
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
  }, [enabled, entryDescriptors, normalizedVaultPath, relevantOpenTabContentKey])

  return state
}

export { filterHighlightGroups }
export type { HighlightExcerpt, HighlightGroup }
