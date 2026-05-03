import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ThoughtRecord } from '../../utils/thoughts'
import { ThoughtPinsLayer } from './ThoughtPinsLayer'

const markdown = '# Title\n\nA matched passage appears in this article.\n\nAnother paragraph.'

function selectionThought(overrides: Partial<ThoughtRecord> = {}): ThoughtRecord {
  return {
    id: 'thought-selection',
    notePath: '/vault/article.md',
    noteTitle: 'Article',
    anchor: {
      type: 'selection',
      quote: 'matched passage',
      prefix: 'A ',
      suffix: ' appears',
      startOffset: 10,
      endOffset: 24,
    },
    bodyMarkdown: 'Selection thought',
    createdAt: '2026-05-03T10:00:00.000Z',
    updatedAt: '2026-05-03T10:00:00.000Z',
    ...overrides,
  }
}

describe('ThoughtPinsLayer', () => {
  it('renders one pin per matched selection thought and opens the selected thought without bubbling', () => {
    const matchedThought = selectionThought()
    const duplicateThought = selectionThought({
      id: 'thought-selection-2',
      bodyMarkdown: 'Second thought',
    })
    const articleThought: ThoughtRecord = {
      ...selectionThought({
        id: 'thought-article',
        bodyMarkdown: 'Article thought',
      }),
      anchor: { type: 'article' },
    }
    const unmatchedThought = selectionThought({
      id: 'thought-unmatched',
      anchor: {
        type: 'selection',
        quote: 'missing quote',
        prefix: '',
        suffix: '',
        startOffset: 0,
        endOffset: 12,
      },
    })
    const onOpenThought = vi.fn()
    const onParentClick = vi.fn()

    render(
      <div onClick={onParentClick}>
        <ThoughtPinsLayer
          thoughts={[matchedThought, duplicateThought, articleThought, unmatchedThought]}
          markdown={markdown}
          onOpenThought={onOpenThought}
        />
      </div>,
    )

    const buttons = screen.getAllByRole('button', { name: 'Open thought' })
    expect(buttons).toHaveLength(2)

    fireEvent.click(buttons[1] as HTMLButtonElement)

    expect(onOpenThought).toHaveBeenCalledWith(
      duplicateThought,
      expect.any(HTMLButtonElement),
    )
    expect(onOpenThought).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('renders nothing when no selection thought anchor matches the article markdown', () => {
    const articleThought: ThoughtRecord = {
      ...selectionThought({ id: 'thought-article' }),
      anchor: { type: 'article' },
    }
    const unmatchedThought = selectionThought({
      id: 'thought-unmatched',
      anchor: {
        type: 'selection',
        quote: 'missing quote',
        prefix: '',
        suffix: '',
        startOffset: 0,
        endOffset: 12,
      },
    })

    render(
      <ThoughtPinsLayer
        thoughts={[articleThought, unmatchedThought]}
        markdown={markdown}
        onOpenThought={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Open thought' })).not.toBeInTheDocument()
  })
})
