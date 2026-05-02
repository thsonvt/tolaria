import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HighlightsList } from './HighlightsList'
import type { HighlightGroup } from '../../utils/highlightMarkdown'

const groups: HighlightGroup[] = [
  {
    notePath: '/vault/a.md',
    noteTitle: 'Harnessing the harness',
    highlights: [
      {
        id: 'h1',
        notePath: '/vault/a.md',
        noteTitle: 'Harnessing the harness',
        excerpt: 'retrieval is infrastructure',
        startOffset: 10,
        endOffset: 41,
      },
    ],
  },
]

describe('HighlightsList', () => {
  it('renders grouped highlights', () => {
    render(<HighlightsList groups={groups} loading={false} error={null} onOpenHighlight={vi.fn()} />)

    expect(screen.getByText('Harnessing the harness')).toBeInTheDocument()
    expect(screen.getByText('retrieval is infrastructure')).toBeInTheDocument()
  })

  it('filters by excerpt text', () => {
    render(<HighlightsList groups={groups} loading={false} error={null} onOpenHighlight={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Filter highlights'), {
      target: { value: 'missing' },
    })

    expect(screen.getByText('No matching highlights')).toBeInTheDocument()
  })

  it('opens a highlighted excerpt', () => {
    const onOpenHighlight = vi.fn()

    render(<HighlightsList groups={groups} loading={false} error={null} onOpenHighlight={onOpenHighlight} />)

    fireEvent.click(screen.getByText('retrieval is infrastructure'))

    expect(onOpenHighlight).toHaveBeenCalledWith(groups[0].highlights[0])
  })

  it('renders a loading state', () => {
    render(<HighlightsList groups={groups} loading error={null} onOpenHighlight={vi.fn()} />)

    expect(screen.getByText('Loading highlights...')).toBeInTheDocument()
  })

  it('renders an error state', () => {
    render(<HighlightsList groups={groups} loading={false} error="boom" onOpenHighlight={vi.fn()} />)

    expect(screen.getByText('Could not load highlights')).toBeInTheDocument()
  })

  it('renders an empty state when no highlights exist', () => {
    render(<HighlightsList groups={[]} loading={false} error={null} onOpenHighlight={vi.fn()} />)

    expect(screen.getByText('No highlights yet')).toBeInTheDocument()
  })
})
