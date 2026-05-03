import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  PopoverAnchor,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import type { ThoughtRecord } from '../../utils/thoughts'

interface ThoughtPopoverProps {
  open: boolean
  anchorLabel: string
  thought?: ThoughtRecord | null
  initialBody?: string
  anchor?: ReactNode
  onOpenChange: (open: boolean) => void
  onSave: (bodyMarkdown: string) => Promise<void>
  onDelete?: () => Promise<void>
  onCloseAutoFocus?: () => void
}

export function ThoughtPopover({
  open,
  anchorLabel,
  thought,
  initialBody,
  anchor,
  onOpenChange,
  onSave,
  onDelete,
  onCloseAutoFocus,
}: ThoughtPopoverProps) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return

    setBody(thought?.bodyMarkdown || initialBody || '')
  }, [initialBody, open, thought])

  const trimmedBody = body.trim()

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {anchor ? <PopoverAnchor asChild>{anchor}</PopoverAnchor> : null}
      <PopoverContent
        aria-label="Thought"
        className="w-80 space-y-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onCloseAutoFocus?.()
        }}
      >
        <PopoverHeader>
          <PopoverTitle>{thought ? 'Edit thought' : 'New thought'}</PopoverTitle>
          <PopoverDescription>{anchorLabel}</PopoverDescription>
        </PopoverHeader>
        <Textarea
          autoFocus
          aria-label="Thought"
          placeholder="Write a thought"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={7}
        />
        <div className="flex items-center justify-between gap-2">
          <div>
            {thought && onDelete && (
              <Button
                type="button"
                variant="ghost"
                disabled={saving || deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await onDelete()
                    onOpenChange(false)
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving || deleting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || deleting || trimmedBody.length === 0}
              onClick={async () => {
                if (!trimmedBody) return

                setSaving(true)
                try {
                  await onSave(trimmedBody)
                  onOpenChange(false)
                } finally {
                  setSaving(false)
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
