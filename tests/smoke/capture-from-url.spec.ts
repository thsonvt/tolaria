import { createServer, type Server } from 'http'
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import { APP_COMMAND_IDS } from '../../src/hooks/appCommandCatalog'
import {
  createFixtureVaultCopy,
  openFixtureVaultDesktopHarness,
  removeFixtureVaultCopy,
} from '../helpers/fixtureVault'
import { triggerMenuCommand } from './testBridge'

const CAPTURE_TITLE = 'Test Capture Article'
const CAPTURE_FILENAME = 'test-capture-article.md'
const CAPTURE_PARAGRAPH = 'Capture from URL stores a readable article body in the active vault.'
const CAPTURE_SECTION = 'Background'
const CAPTURE_IMAGE_URL = 'https://example.com/capture-diagram.png'
const CAPTURE_IMAGE_ALT = 'Capture architecture diagram'
const CAPTURE_SOURCE_TITLE = 'What is Progressive Disclosure?'
const CAPTURE_SOURCE_URL = 'https://example.com/progressive-disclosure'

let tempVaultDir: string
let articleServer: Server | null = null
let articleUrl = ''

async function startArticleServer(): Promise<string> {
  return new Promise((resolve) => {
    articleServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html>
        <html>
          <head><title>${CAPTURE_TITLE}</title></head>
          <body>
            <article>
              <h1>${CAPTURE_TITLE}</h1>
              <p>${CAPTURE_PARAGRAPH}</p>
              <figure>
                <picture>
                  <source type="image/webp" srcset="https://example.com/capture-diagram.webp 800w" />
                  <img src="${CAPTURE_IMAGE_URL}" alt="${CAPTURE_IMAGE_ALT}" />
                </picture>
              </figure>
              <h1 class="header-anchor-post">${CAPTURE_SECTION}</h1>
              <p>The smoke covers the dialog, dev vault API, file write, and reload path.</p>
              <h2>Sources &amp; Further Reading</h2>
              <ul>
                <li><a href="${CAPTURE_SOURCE_URL}">${CAPTURE_SOURCE_TITLE}</a> - Example Source</li>
              </ul>
            </article>
          </body>
        </html>`)
    })

    articleServer.listen(0, '127.0.0.1', () => {
      const address = articleServer?.address()
      if (typeof address === 'object' && address) {
        resolve(`http://127.0.0.1:${address.port}/article`)
      }
    })
  })
}

async function stopArticleServer(): Promise<void> {
  if (!articleServer) return
  await new Promise<void>((resolve, reject) => {
    articleServer?.close((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  articleServer = null
}

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(90_000)
  tempVaultDir = createFixtureVaultCopy()
  articleUrl = await startArticleServer()
  await page.setViewportSize({ width: 1500, height: 900 })
  await openFixtureVaultDesktopHarness(page, tempVaultDir)
})

test.afterEach(async () => {
  await stopArticleServer()
  removeFixtureVaultCopy(tempVaultDir)
})

test('paste URL creates and opens a Capture note @smoke', async ({ page }) => {
  await triggerMenuCommand(page, APP_COMMAND_IDS.fileCaptureUrl)

  await expect(page.getByTestId('capture-from-url-dialog')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('textbox', { name: 'URL' }).fill(articleUrl)
  await page.getByRole('button', { name: 'Capture' }).click()

  await expect(page.getByTestId('capture-from-url-dialog')).not.toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('breadcrumb-filename-trigger')).toContainText('test-capture-article', {
    timeout: 10_000,
  })
  await expect(page.locator('.bn-editor').getByRole('heading', { level: 1, name: CAPTURE_TITLE })).toBeVisible()
  await expect(page.locator('.bn-editor')).toContainText(CAPTURE_PARAGRAPH)

  const capturePath = path.join(tempVaultDir, CAPTURE_FILENAME)
  await expect.poll(() => fs.existsSync(capturePath), { timeout: 5_000 }).toBe(true)
  const content = fs.readFileSync(capturePath, 'utf8')
  expect(content).toContain('type: Capture')
  expect(content).toContain('source: web')
  expect(content).toContain(`url: ${articleUrl}`)
  expect(content).toContain(CAPTURE_PARAGRAPH)
  expect(content).toContain(`![${CAPTURE_IMAGE_ALT}](${CAPTURE_IMAGE_URL})`)
  expect(content).toContain(`## ${CAPTURE_SECTION}`)
  expect(content).toContain(`## Sources & Further Reading`)
  expect(content).toContain(`* [${CAPTURE_SOURCE_TITLE}](${CAPTURE_SOURCE_URL}) - Example Source`)
})
