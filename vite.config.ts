/// <reference types="vitest/config" />
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import matter from 'gray-matter'

// --- Vault API middleware (dev only) ---

interface VaultEntry {
  path: string
  filename: string
  title: string
  isA: string | null
  aliases: string[]
  belongsTo: string[]
  relatedTo: string[]
  status: string | null
  archived: boolean
  trashed: boolean
  trashedAt: number | null
  modifiedAt: number | null
  createdAt: number | null
  fileSize: number
  snippet: string
  wordCount: number
  relationships: Record<string, string[]>
  icon: string | null
  color: string | null
  order: number | null
  sidebarLabel: string | null
  template: string | null
  sort: string | null
  view: string | null
  visible: boolean | null
  outgoingLinks: string[]
  properties: Record<string, string | number | boolean | null>
}

/** Extract all [[wiki-links]] from a string. */
function extractWikiLinks(value: string): string[] {
  const matches = value.match(/\[\[[^\]]+\]\]/g)
  return matches ?? []
}

/** Extract wiki-links from a frontmatter value (string or array of strings). */
function wikiLinksFromValue(value: unknown): string[] {
  if (typeof value === 'string') return extractWikiLinks(value)
  if (Array.isArray(value)) {
    return value.flatMap((v) => (typeof v === 'string' ? extractWikiLinks(v) : []))
  }
  return []
}

// Frontmatter keys that map to dedicated VaultEntry fields (skip in generic relationships)
const DEDICATED_KEYS = new Set([
  'aliases', 'is_a', 'is a', 'belongs_to', 'belongs to',
  'related_to', 'related to', 'status', 'title',
])

function getFrontmatterValue(
  frontmatter: Record<string, unknown>,
  keys: string[],
): unknown {
  const normalizedKeys = new Set(keys.map((key) => key.toLowerCase()))
  return Object.entries(frontmatter).find(([key]) => normalizedKeys.has(key.toLowerCase()))?.[1]
}

function parseYamlBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  switch (value.toLowerCase()) {
    case 'true':
    case 'yes':
      return true
    case 'false':
    case 'no':
      return false
    default:
      return null
  }
}

const vitestCoverageDirectory = process.env.VITEST_COVERAGE_DIR
  ?? path.join(os.tmpdir(), 'tolaria-vitest-coverage', String(process.pid))

const devServerWatchIgnored = [
  '**/coverage/**',
  '**/test-results/**',
  '**/playwright-report/**',
  '**/dist/**',
  '**/src-tauri/target/**',
]

function frontmatterString(frontmatter: Record<string, unknown>, ...keys: string[]): string | null {
  const value = getFrontmatterValue(frontmatter, keys)
  return typeof value === 'string' ? value : null
}

function frontmatterStringArray(frontmatter: Record<string, unknown>, ...keys: string[]): string[] {
  const value = getFrontmatterValue(frontmatter, keys)
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return [value]
  return []
}

function frontmatterBool(frontmatter: Record<string, unknown>, ...keys: string[]): boolean | null {
  return parseYamlBool(getFrontmatterValue(frontmatter, keys))
}

function markdownTitle(content: string, frontmatter: Record<string, unknown>, fallback: string): string {
  const title = frontmatterString(frontmatter, 'title')
  if (title) return title

  const h1Match = content.match(/^#\s+(.+)$/m)
  return h1Match ? h1Match[1].trim() : fallback
}

function markdownBodyText(content: string): string {
  return content.replace(/^#+\s+.+$/gm, '').replace(/[\n\r]+/g, ' ').trim()
}

function frontmatterWikiLinks(frontmatter: Record<string, unknown>, ...keys: string[]): string[] {
  return frontmatterStringArray(frontmatter, ...keys).flatMap((value) => extractWikiLinks(value))
}

function frontmatterRelationships(frontmatter: Record<string, unknown>): Record<string, string[]> {
  const relationships: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(frontmatter)) {
    if (DEDICATED_KEYS.has(key.toLowerCase())) continue
    const links = wikiLinksFromValue(value)
    if (links.length > 0) relationships[key] = links
  }
  return relationships
}

function parseMarkdownFile(filePath: string): VaultEntry | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    const { data, content } = matter(raw)
    const fm = data as Record<string, unknown>

    const filename = path.basename(filePath)
    const basename = filename.replace(/\.md$/, '')

    const title = markdownTitle(content, fm, basename)
    const bodyText = markdownBodyText(content)
    const snippet = bodyText.slice(0, 200)

    return {
      path: filePath,
      filename,
      title,
      isA: frontmatterString(fm, 'is_a', 'is a', 'type'),
      aliases: frontmatterStringArray(fm, 'aliases'),
      belongsTo: frontmatterWikiLinks(fm, 'belongs_to', 'belongs to'),
      relatedTo: frontmatterWikiLinks(fm, 'related_to', 'related to'),
      status: frontmatterString(fm, 'status'),
      archived: frontmatterBool(fm, 'archived') ?? false,
      trashed: frontmatterBool(fm, 'trashed') ?? false,
      trashedAt: null,
      modifiedAt: stats.mtimeMs,
      createdAt: stats.birthtimeMs,
      fileSize: stats.size,
      snippet,
      wordCount: bodyText.split(/\s+/).filter(Boolean).length,
      relationships: frontmatterRelationships(fm),
      icon: frontmatterString(fm, 'icon'),
      color: frontmatterString(fm, 'color'),
      order: fm.order != null ? Number(fm.order) : null,
      sidebarLabel: frontmatterString(fm, 'sidebar label', 'sidebar_label'),
      template: frontmatterString(fm, 'template'),
      sort: frontmatterString(fm, 'sort'),
      view: frontmatterString(fm, 'view'),
      visible: frontmatterBool(fm, 'visible'),
      outgoingLinks: [],
      properties: {},
    }
  } catch {
    return null
  }
}

/** Recursively find all .md files under a directory. */
function findMarkdownFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      if (item.name.startsWith('.')) continue
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        results.push(...findMarkdownFiles(full))
      } else if (item.name.endsWith('.md')) {
        results.push(full)
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return results
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readExistingQueryPath(url: URL, res: ServerResponse, key: string): string | null {
  const filePath = url.searchParams.get(key)
  if (!filePath || !fs.existsSync(filePath)) {
    sendJson(res, { error: 'Invalid or missing path' }, 400)
    return null
  }
  return filePath
}

function updateTitleWikilinks(vaultPath: string, oldTitle: string, _newTitle: string, excludePath: string): number {
  const newPathStem = path.relative(vaultPath, excludePath).replace(/\.md$/i, '')
  const oldTargets = collectLegacyWikilinkTargets(oldTitle, excludePath, vaultPath)
  return updateWikilinksForTargets(vaultPath, oldTargets, newPathStem, excludePath)
}

function collectLegacyWikilinkTargets(oldTitle: string, oldPath: string, vaultPath: string): string[] {
  const oldRelativeStem = path.relative(vaultPath, oldPath).replace(/\.md$/i, '')
  const oldFilenameStem = path.basename(oldPath, '.md')
  return [...new Set([oldTitle, oldRelativeStem, oldFilenameStem].filter(Boolean))]
}

function updateWikilinksForTargets(vaultPath: string, oldTargets: string[], newTarget: string, excludePath: string): number {
  if (oldTargets.length === 0) return 0
  const allFiles = findMarkdownFiles(vaultPath)
  const escaped = oldTargets.map(target => target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = new RegExp(`\\[\\[(?:${escaped.join('|')})(\\|[^\\]]*?)?\\]\\]`, 'g')
  let updatedFiles = 0
  for (const filePath of allFiles) {
    if (filePath === excludePath) continue
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const replaced = content.replace(pattern, (_m: string, pipe: string | undefined) =>
        pipe ? `[[${newTarget}${pipe}]]` : `[[${newTarget}]]`
      )
      if (replaced !== content) {
        fs.writeFileSync(filePath, replaced, 'utf-8')
        updatedFiles++
      }
    } catch {
      // Skip unreadable files in the dev vault API.
    }
  }
  return updatedFiles
}

function updatePathWikilinks(vaultPath: string, oldPath: string, newPath: string, oldTitle: string): number {
  const newRelativeStem = path.relative(vaultPath, newPath).replace(/\.md$/i, '')
  const oldTargets = collectLegacyWikilinkTargets(oldTitle, oldPath, vaultPath)
  return updateWikilinksForTargets(vaultPath, oldTargets, newRelativeStem, newPath)
}

function handleVaultPing(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/ping') return false
  sendJson(res, { ok: true })
  return true
}

function handleVaultList(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/list') return false
  const dirPath = readExistingQueryPath(url, res, 'path')
  if (!dirPath) return true
  const entries = findMarkdownFiles(dirPath).map(parseMarkdownFile).filter(Boolean)
  sendJson(res, entries)
  return true
}

function handleVaultContent(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/content') return false
  const filePath = readExistingQueryPath(url, res, 'path')
  if (!filePath) return true
  sendJson(res, { content: fs.readFileSync(filePath, 'utf-8') })
  return true
}

function handleVaultAllContent(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/all-content') return false
  const dirPath = readExistingQueryPath(url, res, 'path')
  if (!dirPath) return true
  const contentMap: Record<string, string> = {}
  for (const filePath of findMarkdownFiles(dirPath)) {
    try {
      contentMap[filePath] = fs.readFileSync(filePath, 'utf-8')
    } catch {
      // Skip unreadable files.
    }
  }
  sendJson(res, contentMap)
  return true
}

function handleVaultThoughts(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/thoughts') return false
  const vaultPath = readExistingQueryPath(url, res, 'path')
  if (!vaultPath) return true

  const thoughtsDir = path.join(vaultPath, '.tolaria', 'thoughts')
  if (!fs.existsSync(thoughtsDir)) {
    sendJson(res, [])
    return true
  }

  try {
    const thoughts = fs.readdirSync(thoughtsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .flatMap((entry) => {
        const parsed = JSON.parse(fs.readFileSync(path.join(thoughtsDir, entry.name), 'utf-8')) as unknown
        return Array.isArray(parsed) ? parsed : []
      })

    thoughts.sort((left, right) => {
      const leftRecord = left as { id?: string; updatedAt?: string }
      const rightRecord = right as { id?: string; updatedAt?: string }
      return String(rightRecord.updatedAt ?? '').localeCompare(String(leftRecord.updatedAt ?? ''))
        || String(leftRecord.id ?? '').localeCompare(String(rightRecord.id ?? ''))
    })
    sendJson(res, thoughts)
  } catch (err: unknown) {
    sendJson(res, { error: err instanceof Error ? err.message : 'Failed to read thoughts' }, 500)
  }

  return true
}

function handleVaultEntry(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/entry') return false
  const filePath = readExistingQueryPath(url, res, 'path')
  if (!filePath) return true
  sendJson(res, parseMarkdownFile(filePath))
  return true
}

function handleVaultSearch(url: URL, res: ServerResponse): boolean {
  if (url.pathname !== '/api/vault/search') return false
  const vaultPath = url.searchParams.get('vault_path')
  const query = (url.searchParams.get('query') ?? '').toLowerCase()
  const mode = url.searchParams.get('mode') ?? 'all'
  if (!vaultPath || !query) {
    sendJson(res, { results: [], elapsed_ms: 0, query, mode })
    return true
  }

  const results: { title: string; path: string; snippet: string; score: number; note_type: string | null }[] = []
  for (const filePath of findMarkdownFiles(vaultPath)) {
    const entry = parseMarkdownFile(filePath)
    if (!entry || entry.trashed) continue
    const raw = fs.readFileSync(filePath, 'utf-8')
    if (entry.title.toLowerCase().includes(query) || raw.toLowerCase().includes(query)) {
      results.push({ title: entry.title, path: entry.path, snippet: entry.snippet, score: 1.0, note_type: entry.isA })
    }
  }
  sendJson(res, { results: results.slice(0, 20), elapsed_ms: 1, query, mode })
  return true
}

async function handleVaultSave(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (url.pathname !== '/api/vault/save' || req.method !== 'POST') return false
  try {
    const body = await readRequestBody(req)
    const { path: filePath, content } = JSON.parse(body)
    if (!filePath || content === undefined) {
      sendJson(res, { error: 'Missing path or content' }, 400)
      return true
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    sendJson(res, null)
  } catch (err: unknown) {
    sendJson(res, { error: err instanceof Error ? err.message : 'Save failed' }, 500)
  }
  return true
}

const CAPTURE_MAX_BYTES = 5 * 1024 * 1024

interface CaptureMetadata {
  description?: string
  heroImage?: string
}

function captureSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function captureTitle(html: string, fallbackUrl: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const title = h1 ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return stripHtml(title ?? new URL(fallbackUrl).hostname).trim()
}

function captureMetadata(html: string, finalUrl: string): CaptureMetadata {
  const heroImage = firstMetaContent(html, [
    ['property', 'og:image'],
    ['property', 'og:image:url'],
    ['name', 'twitter:image'],
    ['name', 'twitter:image:src'],
    ['property', 'twitter:image'],
    ['property', 'twitter:image:src'],
  ])
  return {
    description: firstMetaContent(html, [
      ['name', 'description'],
      ['property', 'og:description'],
      ['name', 'twitter:description'],
      ['property', 'twitter:description'],
    ]),
    heroImage: heroImage ? absoluteCaptureUrl(heroImage, finalUrl) : undefined,
  }
}

function firstMetaContent(html: string, selectors: Array<[string, string]>): string | undefined {
  for (const [name, value] of selectors) {
    const content = metaContent(html, name, value)
    if (content) return content
  }
  return undefined
}

function metaContent(html: string, name: string, expected: string): string | undefined {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const actual = htmlAttr(tag, name)
    if (actual?.toLowerCase() === expected.toLowerCase()) {
      return htmlAttr(tag, 'content') ?? undefined
    }
  }
  return undefined
}

function absoluteCaptureUrl(value: string, baseUrl: string): string | undefined {
  try {
    return new URL(value.trim(), baseUrl).toString()
  } catch {
    return undefined
  }
}

function captureBodyMarkdown(html: string): string {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]
    ?? html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    ?? html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1]
    ?? html
  const blocks = Array.from(article.matchAll(/<(h[1-6]|p|li)\b([^>]*)>([\s\S]*?)<\/\1>|<img\b([^>]*)\/?>/gi))
    .map((match) => captureBlockMarkdown(match))
    .filter(Boolean)
  return blocks.length > 0 ? blocks.join('\n\n') : stripHtml(article).trim()
}

function captureBlockMarkdown(match: RegExpMatchArray): string {
  const tag = match[1]?.toLowerCase()
  if (tag?.startsWith('h')) {
    const text = stripHtml(match[3] ?? '').trim()
    if (!text) return ''
    const level = tag === 'h1' && /\bheader-anchor-post\b/i.test(match[2] ?? '')
      ? 2
      : Number(tag.slice(1))
    if (level === 1) return ''
    return `${'#'.repeat(level)} ${text}`
  }
  if (tag === 'p') {
    return markdownInline(match[3] ?? '').trim()
  }
  if (tag === 'li') {
    const text = markdownInline(match[3] ?? '').trim()
    return text ? `* ${text}` : ''
  }

  const imgAttrs = match[4] ?? ''
  const src = htmlAttr(imgAttrs, 'src')
  if (!src) return ''
  const alt = htmlAttr(imgAttrs, 'alt') ?? ''
  return `![${alt}](${src})`
}

function htmlAttr(attrs: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attrs.match(new RegExp(`\\b${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim() || null
}

function markdownInline(value: string): string {
  return stripHtml(value.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_match, attrs: string, body: string) => {
    const href = htmlAttr(attrs, 'href')
    const text = stripHtml(body).trim()
    return href && text ? `[${text}](${href})` : text
  }))
}

function stripHtml(value: string): string {
  return decodeHtml(value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' '))
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

function renderCaptureNote(
  title: string,
  sourceUrl: string,
  bodyMarkdown: string,
  metadata: CaptureMetadata,
): { filename: string; content: string } {
  const now = new Date()
  const capturedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const slug = captureSlug(title) || `capture-${capturedAt.replace(/[-:T]/g, '').replace('Z', '')}`
  const filename = `${slug}.md`
  const frontmatter = [
    '---',
    'type: Capture',
    'source: web',
    `url: ${sourceUrl}`,
    `title: ${title}`,
    metadata.description ? `description: ${metadata.description}` : '',
    metadata.heroImage ? `image: ${metadata.heroImage}` : '',
    `captured_at: ${capturedAt}`,
    '---',
  ].filter(Boolean)
  const header = [
    `# ${title}`,
    metadata.description ? `> ${metadata.description}` : '',
    metadata.heroImage ? `![${title} hero image](${metadata.heroImage})` : '',
  ].filter(Boolean)
  const content = [
    ...frontmatter,
    '',
    ...header,
    bodyMarkdown,
    '',
  ].join('\n')
  return { filename, content }
}

async function fetchCaptureHtml(rawUrl: string): Promise<{ finalUrl: string; html: string }> {
  const parsed = new URL(rawUrl.trim())
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('URL must be http or https')
  }

  const response = await fetch(parsed)
  if (!response.ok) {
    throw new Error(`non-success status: ${response.status}`)
  }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('html')) {
    throw new Error(`response is not html: ${contentType}`)
  }
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (declaredLength > CAPTURE_MAX_BYTES) {
    throw new Error('response too large (over 5 MiB)')
  }
  const html = await response.text()
  if (Buffer.byteLength(html) > CAPTURE_MAX_BYTES) {
    throw new Error('response too large (over 5 MiB)')
  }
  return { finalUrl: response.url || parsed.toString(), html }
}

async function handleVaultCaptureUrl(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (url.pathname !== '/api/vault/capture-url' || req.method !== 'POST') return false
  try {
    const body = await readRequestBody(req)
    const { vault_path: vaultPath, url: rawUrl } = JSON.parse(body)
    if (!vaultPath || !fs.existsSync(vaultPath) || !rawUrl) {
      sendJson(res, { error: 'Missing vault path or URL' }, 400)
      return true
    }

    const fetched = await fetchCaptureHtml(String(rawUrl))
    const title = captureTitle(fetched.html, fetched.finalUrl)
    const metadata = captureMetadata(fetched.html, fetched.finalUrl)
    const bodyMarkdown = captureBodyMarkdown(fetched.html)
    if (!bodyMarkdown) {
      sendJson(res, { error: 'article body is empty' }, 422)
      return true
    }

    const note = renderCaptureNote(title, fetched.finalUrl, bodyMarkdown, metadata)
    const target = path.join(vaultPath, note.filename)
    if (fs.existsSync(target)) {
      sendJson(res, { error: `note already exists at ${target}` }, 409)
      return true
    }
    fs.writeFileSync(target, note.content, 'utf-8')
    sendJson(res, target)
  } catch (err: unknown) {
    sendJson(res, { error: err instanceof Error ? err.message : 'Capture failed' }, 500)
  }
  return true
}

async function handleVaultRename(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (url.pathname !== '/api/vault/rename' || req.method !== 'POST') return false
  try {
    const body = await readRequestBody(req)
    const { vault_path: vaultPath, old_path: oldPath, new_title: newTitle } = JSON.parse(body)
    const oldContent = fs.readFileSync(oldPath, 'utf-8')
    const oldTitle = oldContent.match(/^# (.+)$/m)?.[1]?.trim() ?? ''
    const slug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const newPath = path.join(path.dirname(oldPath), `${slug}.md`)
    const newContent = oldContent.replace(/^# .+$/m, `# ${newTitle}`)

    fs.writeFileSync(newPath, newContent, 'utf-8')
    if (newPath !== oldPath) fs.unlinkSync(oldPath)

    const updatedFiles = vaultPath ? updateTitleWikilinks(vaultPath, oldTitle, newTitle, newPath) : 0
    sendJson(res, { new_path: newPath, updated_files: updatedFiles })
  } catch (err: unknown) {
    sendJson(res, { error: err instanceof Error ? err.message : 'Rename failed' }, 500)
  }
  return true
}

type FilenameStemValidation =
  | { ok: true; stem: string }
  | { ok: false; error: string }

function validateMarkdownFilenameStem(value: unknown): FilenameStemValidation {
  const stem = String(value ?? '').trim().replace(/\.md$/i, '').trim()
  if (!stem) return { ok: false, error: 'New filename cannot be empty' }
  if (isUnsafeMarkdownFilenameStem(stem)) return { ok: false, error: 'Invalid filename' }
  return { ok: true, stem }
}

function isUnsafeMarkdownFilenameStem(stem: string): boolean {
  return stem === '.' || stem === '..' || stem.includes('/') || stem.includes('\\')
}

async function handleVaultRenameFilename(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (url.pathname !== '/api/vault/rename-filename' || req.method !== 'POST') return false
  try {
    const body = await readRequestBody(req)
    const {
      vault_path: vaultPath,
      old_path: oldPath,
      new_filename_stem: newFilenameStem,
    } = JSON.parse(body)
    const filename = validateMarkdownFilenameStem(newFilenameStem)
    if (!filename.ok) {
      sendJson(res, { error: filename.error }, 400)
      return true
    }

    const newPath = path.join(path.dirname(oldPath), `${filename.stem}.md`)
    const oldTitle = parseMarkdownFile(oldPath)?.title ?? path.basename(oldPath, '.md')
    if (newPath !== oldPath && fs.existsSync(newPath)) {
      sendJson(res, { error: 'A note with that name already exists' }, 409)
      return true
    }

    fs.renameSync(oldPath, newPath)
    const updatedFiles = vaultPath ? updatePathWikilinks(vaultPath, oldPath, newPath, oldTitle) : 0
    sendJson(res, { new_path: newPath, updated_files: updatedFiles })
  } catch (err: unknown) {
    sendJson(res, { error: err instanceof Error ? err.message : 'Rename failed' }, 500)
  }
  return true
}

async function handleVaultDelete(url: URL, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (url.pathname !== '/api/vault/delete' || req.method !== 'POST') return false
  try {
    const body = await readRequestBody(req)
    const { path: filePath } = JSON.parse(body)
    if (!filePath) {
      sendJson(res, { error: 'Missing path' }, 400)
      return true
    }
    fs.unlinkSync(filePath)
    sendJson(res, filePath)
  } catch (err: unknown) {
    sendJson(res, { error: err instanceof Error ? err.message : 'Delete failed' }, 500)
  }
  return true
}

async function handleVaultApiRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const handlers = [
    () => Promise.resolve(handleVaultPing(url, res)),
    () => Promise.resolve(handleVaultList(url, res)),
    () => Promise.resolve(handleVaultContent(url, res)),
    () => Promise.resolve(handleVaultAllContent(url, res)),
    () => Promise.resolve(handleVaultThoughts(url, res)),
    () => Promise.resolve(handleVaultEntry(url, res)),
    () => Promise.resolve(handleVaultSearch(url, res)),
    () => handleVaultSave(url, req, res),
    () => handleVaultCaptureUrl(url, req, res),
    () => handleVaultRename(url, req, res),
    () => handleVaultRenameFilename(url, req, res),
    () => handleVaultDelete(url, req, res),
  ]

  for (const handler of handlers) {
    if (await handler()) return true
  }

  return false
}

function vaultApiPlugin(): Plugin {
  return {
    name: 'vault-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (await handleVaultApiRequest(req, res)) return
        next()
      })
    },
  }
}

// --- Proxy helpers ---

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => resolve(body))
  })
}

/** WebSocket proxy info endpoint — tells the frontend where the MCP bridge is */
function mcpBridgeInfoPlugin(): Plugin {
  return {
    name: 'mcp-bridge-info',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/api/mcp/info') return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          wsUrl: `ws://localhost:${process.env.MCP_WS_PORT || 9710}`,
          available: true,
        }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), vaultApiPlugin(), mcpBridgeInfoPlugin()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Inject the demo-vault-v2 path in local dev only — production Tauri builds and
  // CI must resolve the default vault path at runtime via the backend to avoid
  // baking the CI runner's absolute path into the distributed bundle.
  define: {
    ...(process.env.CI || (process.env.TAURI_PLATFORM && !process.env.TAURI_DEBUG)
      ? {}
      : { __DEMO_VAULT_PATH__: JSON.stringify(path.resolve(__dirname, 'demo-vault-v2')) }),
  },

  // Prevent vite from obscuring Rust errors
  clearScreen: false,

  // Tauri expects a fixed port
  server: {
    port: 5202,
    strictPort: true,
    allowedHosts: true,
    watch: {
      ignored: devServerWatchIgnored,
    },
  },

  // Env variables starting with TAURI_ are exposed to the frontend
  envPrefix: ['VITE_', 'TAURI_'],

  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS/Linux
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    // Don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
  },

  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Keep coverage temp files off the mounted workspace to avoid flaky
      // read-after-write races when Vitest re-reads its own coverage shards.
      reportsDirectory: vitestCoverageDirectory,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/mock-tauri.ts',
        'src/main.tsx',
        'src/types.ts',
        'src/hooks/useMcpBridge.ts',
        'src/hooks/useAiAgent.ts',
        'src/utils/ai-chat.ts',
        'src/utils/ai-agent.ts',
        'src/components/ui/dropdown-menu.tsx',
        'src/components/ui/scroll-area.tsx',
        'src/components/ui/select.tsx',
        'src/components/ui/separator.tsx',
        'src/components/ui/tabs.tsx',
        'src/components/ui/tooltip.tsx',
        'src/components/ui/card.tsx',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
})
