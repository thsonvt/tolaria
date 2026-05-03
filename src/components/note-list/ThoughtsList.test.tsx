import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ThoughtGroup } from '../../utils/thoughts'
import { ThoughtsList } from './ThoughtsList'

const groups: ThoughtGroup[] = [
  {
    notePath: '/vault/a.md',
    noteTitle: 'Harnessing the harness',
    thoughts: [
      {
        id: 'thought-1',
        notePath: '/vault/a.md',
        noteTitle: 'Harnessing the harness',
        bodyMarkdown: 'A note about retrieval quality.',
        createdAt: '2026-05-03T10:00:00.000Z',
        updatedAt: '2026-05-03T10:00:00.000Z',
        anchor: {
          type: 'selection',
          quote: 'retrieval is infrastructure',
          prefix: '',
          suffix: '',
          startOffset: 10,
          endOffset: 37,
        },
      },
      {
        id: 'thought-2',
        notePath: '/vault/a.md',
        noteTitle: 'Harnessing the harness',
        bodyMarkdown: 'A note about the whole essay.',
        createdAt: '2026-05-03T11:00:00.000Z',
        updatedAt: '2026-05-03T11:00:00.000Z',
        anchor: {
          type: 'article',
        },
      },
    ],
  },
]

describe('ThoughtsList', () => {
  it('renders grouped thoughts and opens a thought row', () => {
    const onOpenThought = vi.fn()

    render(<ThoughtsList groups={groups} loading={false} error={null} onOpenThought={onOpenThought} />)

    expect(screen.getByText('Harnessing the harness')).toBeInTheDocument()
    expect(screen.getByText('A note about retrieval quality.')).toBeInTheDocument()
    expect(screen.getByText('retrieval is infrastructure')).toBeInTheDocument()
    expect(screen.getByText('Whole article')).toBeInTheDocument()

    fireEvent.click(screen.getByText('A note about retrieval quality.'))

    expect(onOpenThought).toHaveBeenCalledWith(groups[0].thoughts[0])
    expect(onOpenThought).toHaveBeenCalledTimes(1)
  })

  it('filters by selection quote text', () => {
    render(<ThoughtsList groups={groups} loading={false} error={null} onOpenThought={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('Filter thoughts'), {
      target: { value: 'missing quote' },
    })

    expect(screen.getByText('No matching thoughts')).toBeInTheDocument()
  })

  it('renders a loading state', () => {
    render(<ThoughtsList groups={groups} loading error={null} onOpenThought={vi.fn()} />)

    expect(screen.getByText('Loading thoughts...')).toBeInTheDocument()
  })

  it('renders an error state', () => {
    render(<ThoughtsList groups={groups} loading={false} error="boom" onOpenThought={vi.fn()} />)

    expect(screen.getByText('Could not load thoughts')).toBeInTheDocument()
  })

  it('renders an empty state when no thoughts exist', () => {
    render(<ThoughtsList groups={[]} loading={false} error={null} onOpenThought={vi.fn()} />)

    expect(screen.getByText('No thoughts yet')).toBeInTheDocument()
  })
})
