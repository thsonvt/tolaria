import { act, renderHook, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import { useHighlightsIndex } from './useHighlightsIndex'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

function entry(
  path: string,
  title: string,
  overrides: Partial<VaultEntry> = {},
): VaultEntry {
  return {
    path,
    filename: path.split('/').pop() ?? path,
    title,
    isA: 'Note',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: 1,
    createdAt: 1,
    fileSize: 10,
    snippet: '',
    wordCount: 2,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: true,
    organized: true,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: true,
    fileKind: 'markdown',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useHighlightsIndex', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('lazily reads markdown notes and groups highlights', async () => {
    vi.mocked(invoke).mockImplementation(async (_command, args) => {
      const path = (args as { path: string }).path
      if (path.endsWith('alpha.md')) return '# Alpha\n\n==first passage=='
      return '# Beta\n\nNo highlights'
    })

    const entries = [
      entry('/vault/alpha.md', 'Alpha'),
      entry('/vault/beta.md', 'Beta'),
    ]
    const openTabContentByPath = {}

    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
      openTabContentByPath,
    }))

    expect(result.current).toMatchObject({
      groups: [],
      highlights: [],
      loading: true,
      error: null,
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(invoke).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
    expect(result.current.highlights).toHaveLength(1)
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0]).toMatchObject({
      notePath: '/vault/alpha.md',
      noteTitle: 'Alpha',
    })
    expect(result.current.groups[0].highlights[0].excerpt).toBe('first passage')
  })

  it('uses open tab content before reading from disk', async () => {
    const entries = [entry('/vault/open.md', 'Open')]
    const openTabContentByPath = {
      '/vault/open.md': '# Open\n\n==live content==',
    }

    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
      openTabContentByPath,
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(invoke).not.toHaveBeenCalled()
    expect(result.current.groups[0].highlights[0].excerpt).toBe('live content')
  })

  it('returns empty state and does not read when disabled', () => {
    const entries = [entry('/vault/alpha.md', 'Alpha')]
    const openTabContentByPath = {
      '/vault/alpha.md': '# Alpha\n\n==live content==',
    }

    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: false,
      vaultPath: '/vault',
      openTabContentByPath,
    }))

    expect(result.current).toEqual({
      groups: [],
      highlights: [],
      loading: false,
      error: null,
    })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('ignores archived and non-markdown entries', async () => {
    vi.mocked(invoke).mockResolvedValue('# Active\n\n==kept==')
    const entries = [
      entry('/vault/active.md', 'Active'),
      entry('/vault/archived.md', 'Archived', { archived: true }),
      entry('/vault/plain.txt', 'Plain', { fileKind: 'text' }),
      entry('/vault/image.png', 'Image', { fileKind: 'binary' }),
    ]
    const openTabContentByPath = {}

    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
      openTabContentByPath,
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('get_note_content', {
      path: '/vault/active.md',
      vaultPath: '/vault',
    })
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].notePath).toBe('/vault/active.md')
  })

  it('drops stale async results when inputs change', async () => {
    const alphaRead = deferred<string>()
    const betaRead = deferred<string>()

    vi.mocked(invoke).mockImplementation(async (_command, args) => {
      const path = (args as { path: string }).path
      if (path === '/vault/alpha.md') return alphaRead.promise
      return betaRead.promise
    })

    const { result, rerender } = renderHook(
      ({ entries, openTabContentByPath }) => useHighlightsIndex({
        entries,
        enabled: true,
        vaultPath: '/vault',
        openTabContentByPath,
      }),
      {
        initialProps: {
          entries: [entry('/vault/alpha.md', 'Alpha')],
          openTabContentByPath: {},
        },
      },
    )

    rerender({
      entries: [entry('/vault/beta.md', 'Beta')],
      openTabContentByPath: {},
    })

    await act(async () => {
      alphaRead.resolve('# Alpha\n\n==stale==')
      betaRead.resolve('# Beta\n\n==fresh==')
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].notePath).toBe('/vault/beta.md')
    expect(result.current.groups[0].highlights[0].excerpt).toBe('fresh')
  })
})
