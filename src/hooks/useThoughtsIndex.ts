import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { VaultEntry } from '../types'
import {
  buildThoughtGroups,
  normalizeThoughtRecord,
  type ThoughtGroup,
  type ThoughtRecord,
} from '../utils/thoughts'

interface UseThoughtsIndexOptions {
  entries: VaultEntry[]
  enabled: boolean
  vaultPath?: string | null
}

interface ThoughtsIndexState {
  groups: ThoughtGroup[]
  thoughts: ThoughtRecord[]
  loading: boolean
  error: string | null
}

interface UseThoughtsIndexResult extends ThoughtsIndexState {
  refresh: () => Promise<void>
  saveThought: (thought: ThoughtRecord) => Promise<ThoughtRecord>
  deleteThought: (thought: ThoughtRecord) => Promise<void>
}

const EMPTY_STATE: ThoughtsIndexState = {
  groups: [],
  thoughts: [],
  loading: false,
  error: null,
}

function normalizeThoughts(value: unknown): ThoughtRecord[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((candidate) => {
    const thought = normalizeThoughtRecord(candidate)
    return thought ? [thought] : []
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useThoughtsIndex({
  entries,
  enabled,
  vaultPath,
}: UseThoughtsIndexOptions): UseThoughtsIndexResult {
  const normalizedVaultPath = vaultPath?.trim() ? vaultPath : null
  const orderedPaths = useMemo(() => entries.map((entry) => entry.path), [entries])
  const [state, setState] = useState<ThoughtsIndexState>(EMPTY_STATE)
  const mountedRef = useRef(true)
  const requestIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled || !normalizedVaultPath) {
      requestIdRef.current += 1
      if (mountedRef.current) {
        setState(EMPTY_STATE)
      }
      return
    }

    const requestId = ++requestIdRef.current
    if (mountedRef.current) {
      setState((current) => ({
        ...current,
        loading: true,
        error: null,
      }))
    }

    try {
      const result = await invoke<unknown>('list_thoughts', {
        vaultPath: normalizedVaultPath,
      })

      if (!mountedRef.current || requestIdRef.current !== requestId) return

      const thoughts = normalizeThoughts(result)
      setState({
        groups: buildThoughtGroups(thoughts, orderedPaths),
        thoughts,
        loading: false,
        error: null,
      })
    } catch (error: unknown) {
      if (!mountedRef.current || requestIdRef.current !== requestId) return

      setState((current) => ({
        ...current,
        loading: false,
        error: errorMessage(error),
      }))
    }
  }, [enabled, normalizedVaultPath, orderedPaths])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveThought = useCallback(async (thought: ThoughtRecord): Promise<ThoughtRecord> => {
    if (!normalizedVaultPath) {
      throw new Error('No vault is open')
    }

    const savedThought = normalizeThoughtRecord(await invoke<unknown>('save_thought', {
      vaultPath: normalizedVaultPath,
      thought,
    })) ?? thought

    await refresh()
    return savedThought
  }, [normalizedVaultPath, refresh])

  const deleteThought = useCallback(async (thought: ThoughtRecord): Promise<void> => {
    if (!normalizedVaultPath) {
      throw new Error('No vault is open')
    }

    await invoke('delete_thought', {
      vaultPath: normalizedVaultPath,
      notePath: thought.notePath,
      thoughtId: thought.id,
    })

    await refresh()
  }, [normalizedVaultPath, refresh])

  return {
    ...state,
    refresh,
    saveThought,
    deleteThought,
  }
}
