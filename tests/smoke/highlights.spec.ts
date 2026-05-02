import fs from 'fs'
import os from 'os'
import path from 'path'
import { expect, test, type Page } from '@playwright/test'
import { openFixtureVaultDesktopHarness } from '../helpers/fixtureVault'
import { installFixtureVaultDesktopBridgeInBrowser } from '../helpers/fixtureVaultDesktopBridge'

const DEMO_VAULT_PATH = path.resolve(process.cwd(), 'demo-vault-v2')
const NOTE_TITLE = 'Writing for Clarity vs. Writing for Credit'
const NOTE_FILENAME = 'writing-for-clarity-vs-writing-for-credit.md'
const READY_TITLE = NOTE_TITLE
const HIGHLIGHT_PHRASE = 'understood before you write'
const HIGHLIGHT_FILTER_QUERY = 'understood'
const HIGHLIGHT_SHORTCUT = process.platform === 'darwin' ? 'Meta+Shift+H' : 'Control+Shift+H'
const SAVE_SHORTCUT = process.platform === 'darwin' ? 'Meta+S' : 'Control+S'

let tempVaultDir: string

function copyDirSync(sourceDir: string, destinationDir: string): void {
  fs.mkdirSync(destinationDir, { recursive: true })
  for (const item of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, item.name)
    const destinationPath = path.join(destinationDir, item.name)
    if (item.isDirectory()) {
      copyDirSync(sourcePath, destinationPath)
      continue
    }
    fs.copyFileSync(sourcePath, destinationPath)
  }
}

function createDemoVaultCopy(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tolaria-demo-vault-'))
  copyDirSync(DEMO_VAULT_PATH, tempDir)
  return tempDir
}

function removeDemoVaultCopy(vaultPath: string | undefined): void {
  if (!vaultPath) return
  fs.rmSync(vaultPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}

async function openNote(page: Page, title: string) {
  await page.getByTestId('note-list-container').getByText(title, { exact: true }).click()
  await expect(page.locator('.bn-editor')).toBeVisible({ timeout: 5_000 })
}

async function installDesktopBridge(page: Page) {
  await page.evaluate(installFixtureVaultDesktopBridgeInBrowser)
  await page.waitForFunction(() => Boolean(window.__TAURI_INTERNALS__))
}

async function selectEditorText(page: Page, targetText: string) {
  const selected = await page.locator('.bn-editor').evaluate((editor, phrase) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      const node = walker.currentNode
      const content = node.textContent ?? ''
      const startIndex = content.indexOf(phrase)

      if (startIndex === -1) continue

      const selection = window.getSelection()
      if (!selection) return false

      const range = document.createRange()
      range.setStart(node, startIndex)
      range.setEnd(node, startIndex + phrase.length)
      selection.removeAllRanges()
      selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      return true
    }

    return false
  }, targetText)

  expect(selected).toBe(true)
}

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000)
  tempVaultDir = createDemoVaultCopy()
  await page.setViewportSize({ width: 1600, height: 900 })
  await openFixtureVaultDesktopHarness(page, tempVaultDir, { expectedReadyTitle: READY_TITLE })
})

test.afterEach(() => {
  removeDemoVaultCopy(tempVaultDir)
})

test('persistent highlights survive reloads and open from the highlights collection @smoke', async ({ page }) => {
  const notePath = path.join(tempVaultDir, NOTE_FILENAME)

  await openNote(page, NOTE_TITLE)
  await selectEditorText(page, HIGHLIGHT_PHRASE)
  await page.keyboard.press(HIGHLIGHT_SHORTCUT)
  await expect(page.locator('.tolaria-highlight').filter({ hasText: HIGHLIGHT_PHRASE })).toBeVisible()

  await page.keyboard.press(SAVE_SHORTCUT)
  await expect.poll(
    () => fs.readFileSync(notePath, 'utf8'),
    { timeout: 5_000, intervals: [100, 200, 300, 500, 1000] },
  ).toContain(`==${HIGHLIGHT_PHRASE}==`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await installDesktopBridge(page)
  await expect(page.getByTestId('note-list-container')).toBeVisible({ timeout: 10_000 })

  await openNote(page, NOTE_TITLE)
  await expect(page.locator('.tolaria-highlight').filter({ hasText: HIGHLIGHT_PHRASE })).toBeVisible()

  await page.getByTestId('sidebar-top-nav').getByText('Highlights', { exact: true }).click()
  await expect(page.getByPlaceholder('Filter highlights')).toBeVisible()
  await page.getByPlaceholder('Filter highlights').fill(HIGHLIGHT_FILTER_QUERY)

  const highlightResult = page.getByRole('button', { name: new RegExp(HIGHLIGHT_FILTER_QUERY, 'i') }).first()
  await expect(highlightResult).toBeVisible()
  await highlightResult.click()

  await expect(page.getByTestId('breadcrumb-filename-trigger')).toContainText(
    NOTE_FILENAME.replace(/\.md$/, ''),
    { timeout: 5_000 },
  )
  await expect(page.locator('.tolaria-highlight').filter({ hasText: HIGHLIGHT_PHRASE })).toBeVisible()
})
