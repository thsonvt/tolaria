import { invoke } from '@tauri-apps/api/core'
import { useCallback, useEffect, useState } from 'react'
import { isTauri, mockInvoke } from '../mock-tauri'

export interface SemanticStatus {
  enabled: boolean
  modelReady: boolean
  indexState: 'disabled' | 'not_ready' | 'indexing' | 'ready' | 'failed'
  indexedNotes: number
  totalNotes: number
  message: string | null
}

interface SemanticStatusData {
  enabled: boolean
  model_ready: boolean
  index_state: SemanticStatus['indexState']
  indexed_notes: number
  total_notes: number
  message: string | null
}

function semanticCall<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return isTauri() ? invoke<T>(command, args) : mockInvoke<T>(command, args)
}

function mapStatus(status: SemanticStatusData): SemanticStatus {
  return {
    enabled: status.enabled,
    modelReady: status.model_ready,
    indexState: status.index_state,
    indexedNotes: status.indexed_notes,
    totalNotes: status.total_notes,
    message: status.message,
  }
}

export function useSemanticSearchSettings(active: boolean) {
  const [status, setStatus] = useState<SemanticStatus | null>(null)

  const refresh = useCallback(async () => {
    const next = await semanticCall<SemanticStatusData>('semantic_index_status')
    setStatus(mapStatus(next))
  }, [])

  useEffect(() => {
    if (!active) return

    let cancelled = false
    async function loadStatus() {
      const next = await semanticCall<SemanticStatusData>('semantic_index_status')
      if (!cancelled) setStatus(mapStatus(next))
    }

    void loadStatus()
    const timer = window.setInterval(() => void loadStatus(), 1500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [active])

  const rebuild = useCallback(async (vaultPath: string) => {
    const next = await semanticCall<SemanticStatusData>(
      'rebuild_semantic_index',
      { vaultPath },
    )
    setStatus(mapStatus(next))
  }, [])

  return { status, refresh, rebuild }
}
