import fs from 'fs'
import os from 'os'
import path from 'path'
import { expect, test, type Page } from '@playwright/test'
import { openFixtureVaultDesktopHarness } from '../helpers/fixtureVault'
import { installFixtureVaultDesktopBridgeInBrowser } from '../helpers/fixtureVaultDesktopBridge'

const DEMO_VAULT_PATH = path.resolve(process.cwd(), 'demo-vault-v2')
// `The Context and the Harness` is not present in `demo-vault-v2`, so this stable note
// and phrase are the fixture-backed fallback for the thoughts smoke flow.
const NOTE_TITLE = 'Writing for Clarity vs. Writing for Credit'
const NOTE_FILENAME = 'writing-for-clarity-vs-writing-for-credit.md'
const READY_TITLE = NOTE_TITLE
const THOUGHT_PHRASE = 'understood before you write'
const THOUGHT_BODY = 'This line makes the note easier to scan on a second pass.'
const THOUGHT_FILTER_QUERY = 'easier to scan'

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

function listThoughtSidecars(vaultPath: string): string[] {
  const thoughtsDir = path.join(vaultPath, '.tolaria', 'thoughts')
  if (!fs.existsSync(thoughtsDir)) return []
  return fs.readdirSync(thoughtsDir).map((filename) => path.join(thoughtsDir, filename))
}

async function openNote(page: Page, title: string) {
  await page.getByTestId('note-list-container').getByText(title, { exact: true }).click()
  await expect(page.locator('.bn-editor')).toBeVisible({ timeout: 5_000 })
}

async function expectOpenNote(page: Page, filenameStem: string, title: string) {
  await expect(page.getByTestId('breadcrumb-filename-trigger')).toContainText(filenameStem, {
    timeout: 5_000,
  })
  await expect(page.locator('.bn-editor').getByRole('heading', { level: 1, name: title })).toBeVisible()
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

test('article thoughts persist across reloads and can be reopened from the thoughts collection @smoke', async ({ page }) => {
  await openNote(page, NOTE_TITLE)
  await expectOpenNote(page, NOTE_FILENAME.replace(/\.md$/, ''), NOTE_TITLE)

  await selectEditorText(page, THOUGHT_PHRASE)
  const addThoughtButton = page.locator('[data-test="add-thought"]')
  await expect(addThoughtButton).toBeVisible()
  await addThoughtButton.click()

  const thoughtTextarea = page.locator('textarea[aria-label="Thought"]')
  try {
    await expect(thoughtTextarea).toBeVisible({ timeout: 1_500 })
  } catch {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('tolaria:add-thought-from-formatting-toolbar'))
    })
    await expect(thoughtTextarea).toBeVisible()
  }
  await thoughtTextarea.fill(THOUGHT_BODY)
  await page.getByRole('button', { name: 'Save' }).click()

  const thoughtPin = page.locator('.tolaria-thought-pin')
  await expect(thoughtPin).toHaveCount(1)
  await expect.poll(
    () => listThoughtSidecars(tempVaultDir).map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n'),
    { timeout: 5_000, intervals: [100, 200, 300, 500, 1000] },
  ).toContain(THOUGHT_BODY)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await installDesktopBridge(page)
  await expect(page.getByTestId('note-list-container')).toBeVisible({ timeout: 10_000 })

  await page.getByTestId('sidebar-top-nav').getByText('Thoughts', { exact: true }).click()
  const filterInput = page.getByPlaceholder('Filter thoughts')
  await expect(filterInput).toBeVisible()
  await filterInput.fill(THOUGHT_FILTER_QUERY)

  const thoughtResult = page.getByRole('button', { name: new RegExp(THOUGHT_FILTER_QUERY, 'i') }).first()
  await expect(thoughtResult).toBeVisible()
  await thoughtResult.click()

  await expectOpenNote(page, NOTE_FILENAME.replace(/\.md$/, ''), NOTE_TITLE)
  await expect(thoughtPin).toHaveCount(1)
  await expect(thoughtTextarea).toHaveValue(THOUGHT_BODY)

  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(thoughtPin).toHaveCount(0)
  await expect(page.getByText('No thoughts yet')).toBeVisible()
})
