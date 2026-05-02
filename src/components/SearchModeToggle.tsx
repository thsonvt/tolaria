import { CaseSensitive, Sparkles } from 'lucide-react'
import type { SearchMode } from '../types'
import { Button } from './ui/button'

interface SearchModeToggleProps {
  value: SearchMode
  semanticEnabled: boolean
  onChange: (mode: SearchMode) => void
  onEnableRequest?: () => void
}

export function SearchModeToggle({
  value,
  semanticEnabled,
  onChange,
  onEnableRequest,
}: SearchModeToggleProps) {
  const selectSemantic = () => {
    if (!semanticEnabled) {
      onEnableRequest?.()
      return
    }

    onChange('semantic')
  }

  return (
    <div
      className="inline-flex shrink-0 rounded-md border border-border bg-muted p-0.5"
      aria-label="Search mode"
    >
      <Button
        type="button"
        variant={value === 'keyword' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 w-8 p-0"
        onClick={() => onChange('keyword')}
        aria-pressed={value === 'keyword'}
        aria-label="Keyword search"
        title="Keyword search"
      >
        <CaseSensitive className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant={value === 'semantic' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-7 w-8 p-0"
        onClick={selectSemantic}
        aria-pressed={value === 'semantic'}
        aria-label={semanticEnabled ? 'Semantic search' : 'Semantic search disabled'}
        title={semanticEnabled ? 'Semantic search' : 'Enable semantic search in Settings'}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  )
}
