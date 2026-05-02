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

  it('stops a stale multi-note scan before reading remaining notes', async () => {
    const alphaRead = deferred<string>()
    const invokeMock = vi.mocked(invoke)

    invokeMock.mockImplementation(async (_command, args) => {
      const path = (args as { path: string }).path
      if (path === '/vault/alpha.md') return alphaRead.promise
      if (path === '/vault/fresh.md') return '# Fresh\n\n==fresh=='
      if (path === '/vault/bravo.md') return '# Bravo\n\n==stale bravo=='
      if (path === '/vault/charlie.md') return '# Charlie\n\n==stale charlie=='
      return ''
    })

    const staleEntries = [
      entry('/vault/alpha.md', 'Alpha'),
      entry('/vault/bravo.md', 'Bravo'),
      entry('/vault/charlie.md', 'Charlie'),
    ]
    const freshEntries = [entry('/vault/fresh.md', 'Fresh')]
    const openTabContentByPath = {}

    const { result, rerender } = renderHook(
      ({ entries, enabled, openTabContentByPath }) => useHighlightsIndex({
        entries,
        enabled,
        vaultPath: '/vault',
        openTabContentByPath,
      }),
      {
        initialProps: {
          entries: staleEntries,
          enabled: true,
          openTabContentByPath,
        },
      },
    )

    expect(invokeMock).toHaveBeenNthCalledWith(1, 'get_note_content', {
      path: '/vault/alpha.md',
      vaultPath: '/vault',
    })

    rerender({
      entries: freshEntries,
      enabled: true,
      openTabContentByPath,
    })

    expect(invokeMock).toHaveBeenNthCalledWith(2, 'get_note_content', {
      path: '/vault/fresh.md',
      vaultPath: '/vault',
    })

    await act(async () => {
      alphaRead.resolve('# Alpha\n\n==stale alpha==')
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).not.toHaveBeenCalledWith('get_note_content', {
      path: '/vault/bravo.md',
      vaultPath: '/vault',
    })
    expect(invokeMock).not.toHaveBeenCalledWith('get_note_content', {
      path: '/vault/charlie.md',
      vaultPath: '/vault',
    })
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].notePath).toBe('/vault/fresh.md')
  })

  it('sets error and clears loading when a disk read fails', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('disk exploded'))
    const entries = [entry('/vault/alpha.md', 'Alpha')]
    const openTabContentByPath = {}

    const { result } = renderHook(() => useHighlightsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
      openTabContentByPath,
    }))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current).toMatchObject({
      groups: [],
      highlights: [],
      loading: false,
      error: 'disk exploded',
    })
  })

  it('does not refetch when unrelated open-tab content changes', async () => {
    const invokeMock = vi.mocked(invoke)
    invokeMock.mockResolvedValue('# Alpha\n\n==indexed==')
    const entries = [entry('/vault/alpha.md', 'Alpha')]

    const { result, rerender } = renderHook(
      ({ openTabContentByPath }) => useHighlightsIndex({
        entries,
        enabled: true,
        vaultPath: '/vault',
        openTabContentByPath,
      }),
      {
        initialProps: {
          openTabContentByPath: {
            '/vault/elsewhere.md': '# Elsewhere\n\n==first==',
          },
        },
      },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(invokeMock).toHaveBeenCalledTimes(1)

    rerender({
      openTabContentByPath: {
        '/vault/elsewhere.md': '# Elsewhere\n\n==second==',
      },
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(result.current.groups[0].highlights[0].excerpt).toBe('indexed')
  })

  it('reuses cached closed-note results when open-tab content changes', async () => {
    const invokeMock = vi.mocked(invoke)
    invokeMock.mockImplementation(async (_command, args) => {
      const path = (args as { path: string }).path
      if (path === '/vault/closed.md') return '# Closed\n\n==closed=='
      throw new Error(`unexpected disk read for ${path}`)
    })

    const entries = [
      entry('/vault/open.md', 'Open'),
      entry('/vault/closed.md', 'Closed'),
    ]
    const loadingStates: boolean[] = []

    const { result, rerender } = renderHook(
      ({ openTabContentByPath }) => {
        const state = useHighlightsIndex({
          entries,
          enabled: true,
          vaultPath: '/vault',
          openTabContentByPath,
        })
        loadingStates.push(state.loading)
        return state
      },
      {
        initialProps: {
          openTabContentByPath: {
            '/vault/open.md': '# Open\n\n==first==',
          },
        },
      },
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(result.current.groups.map((group) => group.notePath)).toEqual([
      '/vault/open.md',
      '/vault/closed.md',
    ])
    expect(result.current.groups[0].highlights[0].excerpt).toBe('first')
    expect(result.current.groups[1].highlights[0].excerpt).toBe('closed')
    const settledLoadingStateCount = loadingStates.length

    rerender({
      openTabContentByPath: {
        '/vault/open.md': '# Open\n\n==second==',
      },
    })

    await waitFor(() => expect(result.current.groups[0].highlights[0].excerpt).toBe('second'))

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(result.current.groups.map((group) => group.notePath)).toEqual([
      '/vault/open.md',
      '/vault/closed.md',
    ])
    expect(result.current.groups[0].highlights[0].excerpt).toBe('second')
    expect(result.current.groups[1].highlights[0].excerpt).toBe('closed')
    expect(loadingStates.slice(settledLoadingStateCount)).not.toContain(true)
  })
})
