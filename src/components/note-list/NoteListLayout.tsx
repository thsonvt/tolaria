import { BulkActionBar } from '../BulkActionBar'
import { FilterPills } from './FilterPills'
import { HighlightsList } from './HighlightsList'
import { NoteListHeader } from './NoteListHeader'
import { EntityView, ListView } from './NoteListViews'
import { ThoughtsList } from './ThoughtsList'
import type { useNoteListModel } from './useNoteListModel'

type NoteListLayoutProps = ReturnType<typeof useNoteListModel> & {
  handleBulkOrganize?: () => void
}

function MultiSelectBar({
  multiSelect,
  isArchivedView,
  handleBulkOrganize,
  handleBulkArchive,
  handleBulkDeletePermanently,
  handleBulkUnarchive,
}: Pick<NoteListLayoutProps, 'multiSelect' | 'isArchivedView' | 'handleBulkOrganize' | 'handleBulkArchive' | 'handleBulkDeletePermanently' | 'handleBulkUnarchive'>) {
  if (!multiSelect.isMultiSelecting) return null

  return (
    <BulkActionBar
      count={multiSelect.selectedPaths.size}
      isArchivedView={isArchivedView}
      onOrganize={handleBulkOrganize}
      onArchive={handleBulkArchive}
      onDelete={handleBulkDeletePermanently}
      onUnarchive={handleBulkUnarchive}
      onClear={multiSelect.clear}
    />
  )
}

function NoteListContent({
  entitySelection,
  searchedGroups,
  query,
  collapsedGroups,
  sortPrefs,
  toggleGroup,
  handleSortChange,
  renderItem,
  isArchivedView,
  isChangesView,
  isInboxView,
  modifiedFilesError,
  searched,
  noteListVirtuosoRef,
  isThoughtsView,
  thoughtGroups,
  thoughtLoading,
  thoughtError,
  onOpenThought,
  isHighlightsView,
  highlightGroups,
  highlightLoading,
  highlightError,
  onOpenHighlight,
  locale,
}: Pick<
  NoteListLayoutProps,
  | 'entitySelection'
  | 'searchedGroups'
  | 'query'
  | 'collapsedGroups'
  | 'sortPrefs'
  | 'toggleGroup'
  | 'handleSortChange'
  | 'renderItem'
  | 'isArchivedView'
  | 'isChangesView'
  | 'isInboxView'
  | 'modifiedFilesError'
  | 'searched'
  | 'noteListVirtuosoRef'
  | 'isThoughtsView'
  | 'thoughtGroups'
  | 'thoughtLoading'
  | 'thoughtError'
  | 'onOpenThought'
  | 'isHighlightsView'
  | 'highlightGroups'
  | 'highlightLoading'
  | 'highlightError'
  | 'onOpenHighlight'
  | 'locale'
>) {
  return (
    <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      {isThoughtsView ? (
        <ThoughtsList
          groups={thoughtGroups}
          loading={thoughtLoading}
          error={thoughtError}
          onOpenThought={onOpenThought ?? (() => {})}
          locale={locale}
        />
      ) : isHighlightsView ? (
        <HighlightsList
          groups={highlightGroups}
          loading={highlightLoading}
          error={highlightError}
          onOpenHighlight={onOpenHighlight ?? (() => {})}
          locale={locale}
        />
      ) : entitySelection ? (
        <EntityView
          entity={entitySelection.entry}
          groups={searchedGroups}
          query={query}
          collapsedGroups={collapsedGroups}
          sortPrefs={sortPrefs}
          onToggleGroup={toggleGroup}
          onSortChange={handleSortChange}
          renderItem={renderItem}
          locale={locale}
        />
      ) : (
        <ListView
          isArchivedView={isArchivedView}
          isChangesView={isChangesView}
          isInboxView={isInboxView}
          changesError={modifiedFilesError}
          searched={searched}
          query={query}
          renderItem={renderItem}
          virtuosoRef={noteListVirtuosoRef}
          locale={locale}
        />
      )}
    </div>
  )
}

function NoteListBody({
  handleListKeyDown,
  noteListContainerRef,
  handleNoteListBlur,
  handleNoteListFocus,
  focusNoteList,
  noteListVirtuosoRef,
  entitySelection,
  searchedGroups,
  query,
  collapsedGroups,
  sortPrefs,
  toggleGroup,
  handleSortChange,
  renderItem,
  isArchivedView,
  isChangesView,
  isInboxView,
  modifiedFilesError,
  searched,
  isThoughtsView,
  thoughtGroups,
  thoughtLoading,
  thoughtError,
  onOpenThought,
  isHighlightsView,
  highlightGroups,
  highlightLoading,
  highlightError,
  onOpenHighlight,
  locale,
  showFilterPills,
  noteListFilter,
  filterCounts,
  onNoteListFilterChange,
}: Pick<
  NoteListLayoutProps,
  | 'handleListKeyDown'
  | 'noteListContainerRef'
  | 'handleNoteListBlur'
  | 'handleNoteListFocus'
  | 'focusNoteList'
  | 'noteListVirtuosoRef'
  | 'entitySelection'
  | 'isHighlightsView'
  | 'highlightGroups'
  | 'highlightLoading'
  | 'highlightError'
  | 'onOpenHighlight'
  | 'searchedGroups'
  | 'query'
  | 'collapsedGroups'
  | 'sortPrefs'
  | 'toggleGroup'
  | 'handleSortChange'
  | 'renderItem'
  | 'isArchivedView'
  | 'isChangesView'
  | 'isInboxView'
  | 'modifiedFilesError'
  | 'searched'
  | 'isThoughtsView'
  | 'thoughtGroups'
  | 'thoughtLoading'
  | 'thoughtError'
  | 'onOpenThought'
  | 'locale'
  | 'showFilterPills'
  | 'noteListFilter'
  | 'filterCounts'
  | 'onNoteListFilterChange'
>) {
  return (
    <div
      ref={noteListContainerRef}
      className="relative flex flex-1 flex-col overflow-hidden outline-none"
      style={{ minHeight: 0 }}
      tabIndex={isHighlightsView || isThoughtsView ? undefined : 0}
      onBlur={isHighlightsView || isThoughtsView ? undefined : handleNoteListBlur}
      onKeyDown={isHighlightsView || isThoughtsView ? undefined : handleListKeyDown}
      onFocus={isHighlightsView || isThoughtsView ? undefined : handleNoteListFocus}
      onClickCapture={isHighlightsView || isThoughtsView ? undefined : focusNoteList}
      data-testid="note-list-container"
    >
      <NoteListContent
        entitySelection={entitySelection}
        searchedGroups={searchedGroups}
        query={query}
        collapsedGroups={collapsedGroups}
        sortPrefs={sortPrefs}
        toggleGroup={toggleGroup}
        handleSortChange={handleSortChange}
        renderItem={renderItem}
        isArchivedView={isArchivedView}
        isChangesView={isChangesView}
        isInboxView={isInboxView}
        modifiedFilesError={modifiedFilesError}
        searched={searched}
        noteListVirtuosoRef={noteListVirtuosoRef}
        isThoughtsView={isThoughtsView}
        thoughtGroups={thoughtGroups}
        thoughtLoading={thoughtLoading}
        thoughtError={thoughtError}
        onOpenThought={onOpenThought}
        isHighlightsView={isHighlightsView}
        highlightGroups={highlightGroups}
        highlightLoading={highlightLoading}
        highlightError={highlightError}
        onOpenHighlight={onOpenHighlight}
        locale={locale}
      />
      {showFilterPills && (
        <FilterPills
          active={noteListFilter}
          counts={filterCounts}
          onChange={onNoteListFilterChange}
          position="bottom"
          locale={locale}
        />
      )}
    </div>
  )
}

function NoteListLayoutHeader({
  title,
  typeDocument,
  isEntityView,
  isThoughtsView,
  isHighlightsView,
  listSort,
  listDirection,
  customProperties,
  locale,
  sidebarCollapsed,
  searchVisible,
  search,
  isSearching,
  searchInputRef,
  propertyPicker,
  handleSortChange,
  handleCreateNote,
  onOpenType,
  toggleSearch,
  setSearch,
  handleSearchKeyDown,
}: Pick<
  NoteListLayoutProps,
  | 'title'
  | 'typeDocument'
  | 'isEntityView'
  | 'isThoughtsView'
  | 'isHighlightsView'
  | 'listSort'
  | 'listDirection'
  | 'customProperties'
  | 'locale'
  | 'sidebarCollapsed'
  | 'searchVisible'
  | 'search'
  | 'isSearching'
  | 'searchInputRef'
  | 'propertyPicker'
  | 'handleSortChange'
  | 'handleCreateNote'
  | 'onOpenType'
  | 'toggleSearch'
  | 'setSearch'
  | 'handleSearchKeyDown'
>) {
  if (isHighlightsView || isThoughtsView) {
    return (
      <div
        className="flex h-[52px] shrink-0 items-center border-b border-border px-4"
        style={{ cursor: 'default', paddingLeft: sidebarCollapsed ? 80 : undefined }}
      >
        <h3 className="m-0 min-w-0 flex-1 truncate text-[14px] font-semibold">
          {title}
        </h3>
      </div>
    )
  }

  return (
    <NoteListHeader
      title={title}
      typeDocument={typeDocument}
      isEntityView={isEntityView}
      listSort={listSort}
      listDirection={listDirection}
      customProperties={customProperties}
      locale={locale}
      sidebarCollapsed={sidebarCollapsed}
      searchVisible={searchVisible}
      search={search}
      isSearching={isSearching}
      searchInputRef={searchInputRef}
      propertyPicker={propertyPicker}
      onSortChange={handleSortChange}
      onCreateNote={handleCreateNote}
      onOpenType={onOpenType}
      onToggleSearch={toggleSearch}
      onSearchChange={setSearch}
      onSearchKeyDown={handleSearchKeyDown}
    />
  )
}

function NoteListFooter({
  multiSelect,
  isArchivedView,
  handleBulkOrganize,
  handleBulkArchive,
  handleBulkDeletePermanently,
  handleBulkUnarchive,
  contextMenuNode,
  dialogNode,
}: Pick<
  NoteListLayoutProps,
  | 'multiSelect'
  | 'isArchivedView'
  | 'handleBulkOrganize'
  | 'handleBulkArchive'
  | 'handleBulkDeletePermanently'
  | 'handleBulkUnarchive'
  | 'contextMenuNode'
  | 'dialogNode'
>) {
  return (
    <>
      <MultiSelectBar
        multiSelect={multiSelect}
        isArchivedView={isArchivedView}
        handleBulkOrganize={handleBulkOrganize}
        handleBulkArchive={handleBulkArchive}
        handleBulkDeletePermanently={handleBulkDeletePermanently}
        handleBulkUnarchive={handleBulkUnarchive}
      />
      {contextMenuNode}{dialogNode}
    </>
  )
}

export function NoteListLayout({
  noteListPanelRef,
  handleNoteListPanelBlurCapture,
  handleNoteListPanelFocusCapture,
  ...contentProps
}: NoteListLayoutProps) {
  return (
    <div
      ref={noteListPanelRef}
      className="flex flex-col select-none overflow-hidden border-r border-border bg-card text-foreground"
      style={{ height: '100%' }}
      onBlurCapture={handleNoteListPanelBlurCapture}
      onFocusCapture={handleNoteListPanelFocusCapture}
    >
      <NoteListLayoutHeader {...contentProps} />
      <NoteListBody {...contentProps} />
      <NoteListFooter {...contentProps} />
    </div>
  )
}
