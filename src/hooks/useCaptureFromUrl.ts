import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'

type CaptureStatus = 'idle' | 'pending' | 'success' | 'error'

interface CaptureFromUrlOptions {
  vaultPath?: string | null
}

interface CaptureUrlArgs {
  url: string
  vaultPath?: string
}

async function invokeCaptureUrl(args: CaptureUrlArgs) {
  return isTauri()
    ? invoke<string>('capture_url', args)
    : mockInvoke<string>('capture_url', args)
}

export function useCaptureFromUrl(options: CaptureFromUrlOptions = {}) {
  const [status, setStatus] = useState<CaptureStatus>('idle')
  const [notePath, setNotePath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const capture = useCallback(async (url: string) => {
    setStatus('pending')
    setNotePath(null)
    setError(null)
    const args: CaptureUrlArgs = { url }
    if (options.vaultPath) args.vaultPath = options.vaultPath

    try {
      const path = await invokeCaptureUrl(args)
      setNotePath(path)
      setStatus('success')
      return path
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStatus('error')
      throw err
    }
  }, [options.vaultPath])

  return { status, notePath, error, capture }
}
