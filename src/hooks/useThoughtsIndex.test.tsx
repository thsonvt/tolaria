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
    const alphaThought = thought()
    const betaThought = thought({
      id: 'thought-2',
      notePath: '/vault/beta.md',
      noteTitle: 'Beta',
      bodyMarkdown: 'Second thought',
    })
    const rawAlphaThought: unknown = {
      ...alphaThought,
      anchor: { type: 'article' },
    }
    const rawBetaThought: unknown = {
      ...betaThought,
      anchor: { type: 'article' },
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

    await waitFor(() => expect(result.current.loading).toBe(false))

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

    await waitFor(() => expect(result.current.loading).toBe(false))

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

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeNull()
    expect(result.current.thoughts).toEqual([validThought])
    expect(result.current.groups).toHaveLength(1)
    expect(result.current.groups[0].thoughts).toEqual([validThought])
  })
})
