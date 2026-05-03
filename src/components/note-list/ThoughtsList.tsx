import { useMemo, useState } from 'react'
import { ChatCenteredText } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  filterThoughtGroups,
  type ThoughtGroup,
  type ThoughtRecord,
} from '../../utils/thoughts'
import { Input } from '../ui/input'
import { EmptyMessage } from './TrashWarningBanner'

interface ThoughtsListProps {
  groups: ThoughtGroup[]
  loading: boolean
  error: string | null
  onOpenThought: (thought: ThoughtRecord) => void
  locale?: AppLocale
}

function resolveAnchorLabel(thought: ThoughtRecord, locale: AppLocale): string {
  return thought.anchor.type === 'selection'
    ? thought.anchor.quote
    : translate(locale, 'noteList.thoughts.wholeArticle')
}

export function ThoughtsList({
  groups,
  loading,
  error,
  onOpenThought,
  locale = 'en',
}: ThoughtsListProps) {
  const [query, setQuery] = useState('')
  const filteredGroups = useMemo(
    () => filterThoughtGroups(groups, query),
    [groups, query],
  )

  if (loading) {
    return <EmptyMessage text={translate(locale, 'noteList.thoughts.loading')} />
  }

  if (error) {
    return <EmptyMessage text={translate(locale, 'noteList.thoughts.error')} />
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border p-3">
        <Input
          aria-label={translate(locale, 'noteList.thoughts.filterPlaceholder')}
          placeholder={translate(locale, 'noteList.thoughts.filterPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {groups.length === 0 ? (
          <EmptyMessage text={translate(locale, 'noteList.thoughts.empty')} />
        ) : filteredGroups.length === 0 ? (
          <EmptyMessage text={translate(locale, 'noteList.thoughts.noMatching')} />
        ) : (
          filteredGroups.map((group) => (
            <section key={group.notePath} className="mb-4 last:mb-0">
              <div className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.noteTitle}
              </div>
              <div className="space-y-1">
                {group.thoughts.map((thought) => (
                  <Button
                    key={thought.id}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full items-start justify-start gap-2 whitespace-normal rounded-md px-2 py-2 text-left text-sm"
                    onClick={() => onOpenThought(thought)}
                  >
                    <ChatCenteredText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" weight="fill" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-3 block text-foreground">{thought.bodyMarkdown}</span>
                      <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
                        {resolveAnchorLabel(thought, locale)}
                      </span>
                    </span>
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
