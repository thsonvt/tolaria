import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCaptureFromUrl } from './useCaptureFromUrl'

const invoke = vi.fn()
const mockInvoke = vi.fn()
let tauriRuntime = true

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}))

vi.mock('../mock-tauri', () => ({
  isTauri: () => tauriRuntime,
  mockInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

beforeEach(() => {
  invoke.mockReset()
  mockInvoke.mockReset()
  tauriRuntime = true
})

describe('useCaptureFromUrl', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCaptureFromUrl())
    expect(result.current.status).toBe('idle')
    expect(result.current.notePath).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('reports pending while invoking', async () => {
    invoke.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useCaptureFromUrl())

    act(() => {
      void result.current.capture('https://example.com/post')
    })

    await waitFor(() => expect(result.current.status).toBe('pending'))
  })

  it('reports success with the new note path', async () => {
    invoke.mockResolvedValue('/vault/post.md')
    const { result } = renderHook(() => useCaptureFromUrl({ vaultPath: '/vault' }))

    await act(async () => {
      await result.current.capture('https://example.com/post')
    })

    expect(result.current.status).toBe('success')
    expect(result.current.notePath).toBe('/vault/post.md')
    expect(invoke).toHaveBeenCalledWith('capture_url', {
      url: 'https://example.com/post',
      vaultPath: '/vault',
    })
  })

  it('reports error when invoke rejects', async () => {
    invoke.mockRejectedValue('fetch failed: 500')
    const { result } = renderHook(() => useCaptureFromUrl())

    await act(async () => {
      await expect(result.current.capture('https://example.com/x')).rejects.toBe('fetch failed: 500')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('fetch failed: 500')
  })

  it('uses mockInvoke outside Tauri', async () => {
    tauriRuntime = false
    mockInvoke.mockResolvedValue('/vault/browser.md')
    const { result } = renderHook(() => useCaptureFromUrl({ vaultPath: '/vault' }))

    await act(async () => {
      await result.current.capture('https://example.com/browser')
    })

    expect(mockInvoke).toHaveBeenCalledWith('capture_url', {
      url: 'https://example.com/browser',
      vaultPath: '/vault',
    })
    expect(invoke).not.toHaveBeenCalled()
  })
})
