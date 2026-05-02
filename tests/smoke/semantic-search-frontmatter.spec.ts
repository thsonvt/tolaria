import { expect, test } from '@playwright/test'

type MockHandler = (args?: Record<string, unknown>) => unknown

declare global {
  interface Window {
    __mockHandlers?: Record<string, MockHandler>
    __semanticSearchCalls?: number
  }
}

function shortcut(key: string) {
  return process.platform === 'darwin' ? `Meta+${key}` : `Control+${key}`
}

test('semantic search finds frontmatter-backed author query @smoke', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__mockHandlers?.semantic_index_status))

  await page.evaluate(() => {
    const handlers = window.__mockHandlers
    if (!handlers) throw new Error('Mock handlers unavailable')

    let semanticEnabled = false
    const saveSettings = handlers.save_settings
    handlers.save_settings = (args?: Record<string, unknown>) => {
      const settings = args?.settings as { semantic_search_enabled?: boolean } | undefined
      semanticEnabled = settings?.semantic_search_enabled === true
      return saveSettings?.(args) ?? null
    }
    handlers.semantic_index_status = () => ({
      enabled: semanticEnabled,
      model_ready: semanticEnabled,
      index_state: semanticEnabled ? 'ready' : 'disabled',
      indexed_notes: semanticEnabled ? 2 : 0,
      total_notes: semanticEnabled ? 2 : 0,
      message: null,
    })
    handlers.search_vault_semantic = (args?: Record<string, unknown>) => ({
      results: (() => {
        window.__semanticSearchCalls = (window.__semanticSearchCalls ?? 0) + 1
        return [
          {
            title: 'Apollo',
            path: '/Users/mock/demo-vault-v2/apollo.md',
            snippet: 'Title: Apollo | Type: Project | author: Shau',
            score: 1,
            note_type: 'Project',
          },
        ]
      })(),
      elapsed_ms: 1,
      query: args?.query ?? '',
      mode: 'semantic',
    })
  })

  await page.keyboard.press(shortcut(','))
  await page.getByRole('switch', { name: 'Enable semantic search' }).click()
  await page.getByRole('button', { name: 'Save' }).click()

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('laputa:dispatch-command', {
      detail: 'edit-find-in-vault',
    }))
  })
  await expect(page.getByPlaceholder('Search in all notes...')).toBeVisible()
  const semanticButton = page.getByRole('button', { name: /^Semantic search$/ })
  await expect(semanticButton).toBeVisible()
  await semanticButton.click()
  await expect(semanticButton).toHaveAttribute('aria-pressed', 'true')
  await page.getByPlaceholder('Search in all notes...').fill('notes by Shau')

  await page.waitForFunction(() => (window.__semanticSearchCalls ?? 0) > 0)
  await expect(page.getByText(/Apollo|author: Shau/i)).toBeVisible()
})
