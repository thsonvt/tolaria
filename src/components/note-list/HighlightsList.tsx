import { useMemo, useState } from 'react'
import { Highlighter } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  filterHighlightGroups,
  type HighlightExcerpt,
  type HighlightGroup,
} from '../../utils/highlightMarkdown'
import { Input } from '../ui/input'
import { EmptyMessage } from './TrashWarningBanner'

interface HighlightsListProps {
  groups: HighlightGroup[]
  loading: boolean
  error: string | null
  onOpenHighlight: (highlight: HighlightExcerpt) => void
  locale?: AppLocale
}

export function HighlightsList({
  groups,
  loading,
  error,
  onOpenHighlight,
  locale = 'en',
}: HighlightsListProps) {
  const [query, setQuery] = useState('')
  const filteredGroups = useMemo(
    () => filterHighlightGroups(groups, query),
    [groups, query],
  )

  if (loading) {
    return <EmptyMessage text={translate(locale, 'noteList.highlights.loading')} />
  }

  if (error) {
    return <EmptyMessage text={translate(locale, 'noteList.highlights.error')} />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <Input
          aria-label={translate(locale, 'noteList.highlights.filterPlaceholder')}
          placeholder={translate(locale, 'noteList.highlights.filterPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.length === 0 ? (
          <EmptyMessage text={translate(locale, 'noteList.highlights.empty')} />
        ) : filteredGroups.length === 0 ? (
          <EmptyMessage text={translate(locale, 'noteList.highlights.noMatching')} />
        ) : (
          filteredGroups.map((group) => (
            <section key={group.notePath} className="mb-4 last:mb-0">
              <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.noteTitle}
              </div>
              <div className="space-y-1">
                {group.highlights.map((highlight) => (
                  <Button
                    key={highlight.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full items-start justify-start gap-2 whitespace-normal rounded-md px-2 py-2 text-left text-sm"
                    onClick={() => onOpenHighlight(highlight)}
                  >
                    <Highlighter className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" weight="fill" />
                    <span className="line-clamp-3 text-foreground">{highlight.excerpt}</span>
                  </Button>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
