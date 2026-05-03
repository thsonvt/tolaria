import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useCaptureFromUrl } from '../hooks/useCaptureFromUrl'

interface CaptureFromUrlDialogProps {
  open: boolean
  vaultPath?: string | null
  onOpenChange: (open: boolean) => void
  onCaptured?: (notePath: string) => void
}

export function CaptureFromUrlDialog({
  open,
  vaultPath,
  onOpenChange,
  onCaptured,
}: CaptureFromUrlDialogProps) {
  const [url, setUrl] = useState('')
  const { status, error, capture } = useCaptureFromUrl({ vaultPath })
  const trimmedUrl = url.trim()
  const pending = status === 'pending'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedUrl || pending) return

    try {
      const notePath = await capture(trimmedUrl)
      onCaptured?.(notePath)
      setUrl('')
      onOpenChange(false)
    } catch {
      // Error text is rendered from hook state.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]" data-testid="capture-from-url-dialog">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Capture from URL</DialogTitle>
            <DialogDescription>
              Save a readable copy of a web article as a Capture note.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="capture-url-input">
              URL
            </label>
            <Input
              id="capture-url-input"
              autoFocus
              disabled={pending}
              placeholder="https://example.com/article"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          {status === 'error' && error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="flex-row justify-end sm:justify-end">
            <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmedUrl || pending}>
              {pending ? 'Capturing...' : 'Capture'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
