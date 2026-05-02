import { act, renderHook, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VaultEntry } from '../types'
import type { ThoughtRecord } from '../utils/thoughts'
import { useThoughtsIndex } from './useThoughtsIndex'

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

function thought(
  overrides: Partial<ThoughtRecord> = {},
): ThoughtRecord {
  return {
    id: 'thought-1',
    notePath: '/vault/alpha.md',
    noteTitle: 'Alpha',
    anchor: { type: 'article' },
    bodyMarkdown: 'First thought',
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z',
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

describe('useThoughtsIndex', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('stays empty and does not invoke when disabled', () => {
    const entries = [entry('/vault/alpha.md', 'Alpha')]

    const { result } = renderHook(() => useThoughtsIndex({
      entries,
      enabled: false,
      vaultPath: '/vault',
    }))

    expect(result.current.groups).toEqual([])
    expect(result.current.thoughts).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('loads thoughts, normalizes them, and groups by entry order', async () => {
    const alphaThought = thought({
      anchor: {
        type: 'selection',
        quote: 'Alpha quote',
        prefix: 'Before ',
        suffix: ' after',
        startOffset: 7,
        endOffset: 18,
      },
      bodyMarkdown: 'Normalized alpha thought',
    })
    const betaThought = thought({
      id: 'thought-2',
      notePath: '/vault/beta.md',
      noteTitle: 'Beta',
      bodyMarkdown: 'Second thought',
    })
    const rawAlphaThought: unknown = {
      id: 'thought-1',
      notePath: '/vault/alpha.md',
      noteTitle: 'Alpha',
      anchor: {
        type: 'selection',
        quote: 'Alpha quote',
        prefix: 'Before ',
        suffix: ' after',
        startOffset: 7,
        endOffset: 18,
      },
      bodyMarkdown: 'Normalized alpha thought',
      createdAt: '2026-05-03T10:00:00.000Z',
      updatedAt: '2026-05-03T10:00:00.000Z',
    }
    const rawBetaThought: unknown = {
      id: 'thought-2',
      notePath: '/vault/beta.md',
      noteTitle: 'Beta',
      anchor: { type: 'article' },
      bodyMarkdown: 'Second thought',
      createdAt: '2026-05-03T10:00:00.000Z',
      updatedAt: '2026-05-03T10:00:00.000Z',
    }
    const entries = [
      entry('/vault/alpha.md', 'Alpha'),
      entry('/vault/beta.md', 'Beta'),
    ]

    vi.mocked(invoke).mockResolvedValueOnce([
      rawBetaThought,
      rawAlphaThought,
    ])

    const { result } = renderHook(() => useThoughtsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(result.current.thoughts).toEqual([betaThought, alphaThought]))

    expect(invoke).toHaveBeenCalledWith('list_thoughts', { vaultPath: '/vault' })
    expect(result.current.error).toBeNull()
    expect(result.current.thoughts).toEqual([betaThought, alphaThought])
    expect(result.current.groups.map((group) => group.notePath)).toEqual([
      '/vault/alpha.md',
      '/vault/beta.md',
    ])
    expect(result.current.groups[0].thoughts).toEqual([alphaThought])
    expect(result.current.groups[1].thoughts).toEqual([betaThought])
  })

  it('saves a thought, refreshes, and updates state', async () => {
    const savedThought = thought()
    const entries = [entry('/vault/alpha.md', 'Alpha')]

    vi.mocked(invoke)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(savedThought)
      .mockResolvedValueOnce([savedThought])

    const { result } = renderHook(() => useThoughtsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returnedThought: ThoughtRecord | undefined
    await act(async () => {
      returnedThought = await result.current.saveThought(savedThought)
    })

    await waitFor(() => expect(result.current.thoughts).toEqual([savedThought]))

    expect(returnedThought).toEqual(savedThought)
    expect(invoke).toHaveBeenNthCalledWith(2, 'save_thought', {
      vaultPath: '/vault',
      thought: savedThought,
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'list_thoughts', {
      vaultPath: '/vault',
    })
    expect(result.current.groups[0].thoughts).toEqual([savedThought])
  })

  it('deletes a thought, refreshes, and updates state', async () => {
    const existingThought = thought()
    const entries = [entry('/vault/alpha.md', 'Alpha')]

    vi.mocked(invoke)
      .mockResolvedValueOnce([existingThought])
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([])

    const { result } = renderHook(() => useThoughtsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(result.current.thoughts).toEqual([existingThought]))

    await act(async () => {
      await result.current.deleteThought(existingThought)
    })

    await waitFor(() => expect(result.current.thoughts).toEqual([]))

    expect(invoke).toHaveBeenNthCalledWith(2, 'delete_thought', {
      vaultPath: '/vault',
      notePath: '/vault/alpha.md',
      thoughtId: 'thought-1',
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'list_thoughts', {
      vaultPath: '/vault',
    })
    expect(result.current.groups).toEqual([])
  })

  it('sets error state when list_thoughts rejects', async () => {
    const entries = [entry('/vault/alpha.md', 'Alpha')]

    vi.mocked(invoke).mockRejectedValueOnce(new Error('sidecar offline'))

    const { result } = renderHook(() => useThoughtsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(result.current.error).toBe('sidecar offline'))

    expect(result.current.groups).toEqual([])
    expect(result.current.thoughts).toEqual([])
    expect(result.current.error).toBe('sidecar offline')
  })

  it('filters malformed records from list_thoughts results', async () => {
    const validThought = thought()
    const entries = [entry('/vault/alpha.md', 'Alpha')]

    vi.mocked(invoke).mockResolvedValueOnce([
      validThought,
      {
        id: '',
        notePath: '/vault/beta.md',
        noteTitle: 'Beta',
        anchor: { type: 'article' },
        bodyMarkdown: 'invalid',
        createdAt: '2026-05-03T10:00:00.000Z',
        updatedAt: '2026-05-03T10:00:00.000Z',
      },
      {
        id: 'thought-3',
        note_path: '/vault/gamma.md',
        noteTitle: 'Gamma',
        anchor: { type: 'article' },
        bodyMarkdown: 'invalid',
        createdAt: '2026-05-03T10:00:00.000Z',
        updatedAt: '2026-05-03T10:00:00.000Z',
      },
    ])

    const { result } = renderHook(() => useThoughtsIndex({
      entries,
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(result.current.thoughts).toEqual([validThought]))

    expect(result.current.error).toBeNull()
    expect(result.current.thoughts).toEqual([validThought])
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].thoughts).toEqual([validThought])
  })

  it('does not refetch when rerendered with a new entries array identity that keeps the same paths', async () => {
    const alphaThought = thought()
    const betaThought = thought({
      id: 'thought-2',
      notePath: '/vault/beta.md',
      noteTitle: 'Beta',
      bodyMarkdown: 'Second thought',
    })

    vi.mocked(invoke).mockResolvedValueOnce([betaThought, alphaThought])

    const { result, rerender } = renderHook(
      ({ entries }) => useThoughtsIndex({
        entries,
        enabled: true,
        vaultPath: '/vault',
      }),
      {
        initialProps: {
          entries: [
            entry('/vault/alpha.md', 'Alpha'),
            entry('/vault/beta.md', 'Beta'),
          ],
        },
      },
    )

    await waitFor(() => expect(result.current.thoughts).toEqual([betaThought, alphaThought]))

    rerender({
      entries: [
        entry('/vault/beta.md', 'Beta'),
        entry('/vault/alpha.md', 'Alpha'),
      ],
    })

    await waitFor(() => expect(result.current.groups.map((group) => group.notePath)).toEqual([
      '/vault/beta.md',
      '/vault/alpha.md',
    ]))

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(result.current.groups[0].thoughts).toEqual([betaThought])
    expect(result.current.groups[1].thoughts).toEqual([alphaThought])
  })

  it('clears stale thoughts when switching vaults and the new load fails', async () => {
    const existingThought = thought()

    vi.mocked(invoke)
      .mockResolvedValueOnce([existingThought])
      .mockRejectedValueOnce(new Error('new vault unavailable'))

    const { result, rerender } = renderHook(
      ({ vaultPath }) => useThoughtsIndex({
        entries: [entry(`${vaultPath}/alpha.md`, 'Alpha')],
        enabled: true,
        vaultPath,
      }),
      {
        initialProps: {
          vaultPath: '/vault-a',
        },
      },
    )

    await waitFor(() => expect(result.current.thoughts).toEqual([existingThought]))

    rerender({
      vaultPath: '/vault-b',
    })

    await waitFor(() => expect(result.current.error).toBe('new vault unavailable'))

    expect(result.current.thoughts).toEqual([])
    expect(result.current.groups).toEqual([])
    expect(result.current.error).toBe('new vault unavailable')
  })

  it('keeps only the latest overlapping refresh result', async () => {
    const firstRefresh = deferred<unknown>()
    const secondRefresh = deferred<unknown>()
    const invokeMock = vi.mocked(invoke)

    invokeMock
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => firstRefresh.promise)
      .mockImplementationOnce(async () => secondRefresh.promise)

    const { result } = renderHook(() => useThoughtsIndex({
      entries: [entry('/vault/alpha.md', 'Alpha')],
      enabled: true,
      vaultPath: '/vault',
    }))

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const firstThought = thought({ bodyMarkdown: 'older result' })
    const secondThought = thought({ bodyMarkdown: 'newer result' })

    let firstPromise!: Promise<void>
    let secondPromise!: Promise<void>
    await act(async () => {
      firstPromise = result.current.refresh()
      secondPromise = result.current.refresh()
    })

    await act(async () => {
      secondRefresh.resolve([secondThought])
      await secondPromise
    })

    await waitFor(() => expect(result.current.thoughts).toEqual([secondThought]))

    await act(async () => {
      firstRefresh.resolve([firstThought])
      await firstPromise
    })

    expect(result.current.thoughts).toEqual([secondThought])
    expect(result.current.groups[0].thoughts).toEqual([secondThought])
  })

  it('does not update state after unmount when a fetch resolves later', async () => {
    const pendingLoad = deferred<unknown>()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    vi.mocked(invoke).mockImplementationOnce(async () => pendingLoad.promise)

    const { unmount } = renderHook(() => useThoughtsIndex({
      entries: [entry('/vault/alpha.md', 'Alpha')],
      enabled: true,
      vaultPath: '/vault',
    }))

    unmount()

    await act(async () => {
      pendingLoad.resolve([thought()])
      await pendingLoad.promise
    })

    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
