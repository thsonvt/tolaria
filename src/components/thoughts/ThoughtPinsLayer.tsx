import { useMemo } from 'react'
import { ChatCenteredText } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import {
  matchThoughtAnchor,
  type ThoughtRecord,
} from '../../utils/thoughts'

interface ThoughtPinsLayerProps {
  thoughts: ThoughtRecord[]
  markdown: string
  onOpenThought: (thought: ThoughtRecord, anchorElement?: HTMLElement | null) => void
}

interface MatchedThoughtPin {
  thought: ThoughtRecord
  topOffset: number
}

function buildMatchedThoughtPins(thoughts: ThoughtRecord[], markdown: string): MatchedThoughtPin[] {
  let pinIndex = 0

  return thoughts.flatMap((thought) => {
    if (thought.anchor.type !== 'selection') return []
    if (!matchThoughtAnchor(thought.anchor, markdown)) return []

    const matchedThought = {
      thought,
      topOffset: pinIndex * 36,
    }
    pinIndex += 1
    return [matchedThought]
  })
}

export function ThoughtPinsLayer({
  thoughts,
  markdown,
  onOpenThought,
}: ThoughtPinsLayerProps) {
  const matchedThoughtPins = useMemo(
    () => buildMatchedThoughtPins(thoughts, markdown),
    [markdown, thoughts],
  )

  if (matchedThoughtPins.length === 0) return null

  return (
    <div className="tolaria-thought-pins">
      {matchedThoughtPins.map(({ thought, topOffset }) => (
        <Button
          key={thought.id}
          type="button"
          variant="secondary"
          size="icon-xs"
          className="tolaria-thought-pin"
          aria-label="Open thought"
          style={{ top: `${topOffset}px` }}
          onClick={(event) => {
            event.stopPropagation()
            onOpenThought(thought, event.currentTarget)
          }}
        >
          <ChatCenteredText weight="fill" />
        </Button>
      ))}
    </div>
  )
}
