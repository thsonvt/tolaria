import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogs } from './useDialogs'

describe('useDialogs', () => {
  it('opens the quick-open palette without opening full vault search', () => {
    const { result } = renderHook(() => useDialogs())

    act(() => result.current.openQuickOpen())

    expect(result.current.showQuickOpen).toBe(true)
    expect(result.current.showSearch).toBe(false)
  })
})
