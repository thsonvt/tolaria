import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogs } from './useDialogs'

describe('useDialogs', () => {
  it('routes quick-open shortcuts to the semantic-capable search panel', () => {
    const { result } = renderHook(() => useDialogs())

    act(() => result.current.openQuickOpen())

    expect(result.current.showSearch).toBe(true)
    expect(result.current.showQuickOpen).toBe(false)
  })
})
