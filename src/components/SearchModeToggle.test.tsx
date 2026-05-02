import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchModeToggle } from './SearchModeToggle'

describe('SearchModeToggle', () => {
  it('calls onChange when semantic mode is enabled', () => {
    const onChange = vi.fn()

    render(
      <SearchModeToggle
        value="keyword"
        semanticEnabled={true}
        onChange={onChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Semantic search' }))

    expect(onChange).toHaveBeenCalledWith('semantic')
  })

  it('calls onEnableRequest when semantic mode is disabled', () => {
    const onEnableRequest = vi.fn()

    render(
      <SearchModeToggle
        value="keyword"
        semanticEnabled={false}
        onChange={vi.fn()}
        onEnableRequest={onEnableRequest}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Semantic search disabled' }),
    )

    expect(onEnableRequest).toHaveBeenCalledOnce()
  })
})
