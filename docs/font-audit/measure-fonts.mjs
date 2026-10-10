// Read-only production font audit. Run from the repository root after `npm ci`.
// node docs/font-audit/measure-fonts.mjs > _workspace/font-audit.json
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'

const origin = process.env.FONT_AUDIT_ORIGIN || 'https://toldlife.duvridge.com'
const fontUrl = url => /https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url) || /\.(woff2?|ttf|otf)(\?|$)/.test(url)
const browser = await chromium.launch()
const result = {
  schemaVersion: 1,
  measuredAt: new Date().toISOString(),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  origin,
  browser: await browser.version(),
  method: {
    cache: 'Fresh context per journey, HTTP cache enabled within each journey. No request routing.',
    bytes: 'CDP loadingFinished.encodedDataLength; cache responses counted separately. Includes response overhead.',
    timing: 'Milliseconds since each document navigation; native network unless explicitly throttled.',
    cls: 'Sum of layout-shift values without recent input during the observation, not a full-session CWV score.',
    completion: 'DOMContentLoaded, two animation frames, document.fonts.ready, then 500 ms observation. readyObservedAt can be later than loadingdone.',
  },
  deployment: await (await fetch(`${origin}/deployment.json`)).json(),
  journeys: [],
}

async function journey(name, viewport, steps, network, storage = {}, earlyFacePreview = false) {
  const context = await browser.newContext({ viewport })
  await context.addInitScript(() => {
    window.__fontAudit = { events: [], shifts: [], lcp: null }
    document.fonts.addEventListener('loading', () => window.__fontAudit.events.push({ event: 'loading', at: performance.now() }))
    document.fonts.addEventListener('loadingdone', e => window.__fontAudit.events.push({ event: 'loadingdone', at: performance.now(), faces: e.fontfaces.length }))
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__fontAudit.shifts.push({ at: entry.startTime, value: entry.value })
    }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver(list => {
      window.__fontAudit.lcp = list.getEntries().at(-1)?.startTime ?? null
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  if (Object.keys(storage).length) await context.addInitScript(entries => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
  }, storage)
  if (earlyFacePreview) await context.addInitScript(() => {
    // Analysis-only cold-entry prototype; this does not implement preference changes.
    // Match the saved face before the server-rendered default can initiate font loads.
    const install = () => {
      if (!document.documentElement) return false
      const style = document.createElement('style')
      style.textContent = ':root[data-font-audit-face="sans"] .page-reader { --reading-face: var(--face-ui) }'
      document.documentElement.dataset.fontAuditFace = 'sans'
      document.documentElement.append(style)
      return true
    }
    if (!install()) {
      const observer = new MutationObserver(() => { if (install()) observer.disconnect() })
      observer.observe(document, { childList: true, subtree: true })
    }
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  if (network) await cdp.send('Network.emulateNetworkConditions', network)
  let requests = new Map()
  let documents = []
  const cssByUrl = new Map()
  const pendingCss = new Set()
  cdp.on('Network.requestWillBeSent', e => {
    if (e.type === 'Document') documents.push(e.request.url)
    if (fontUrl(e.request.url)) requests.set(e.requestId, { url: e.request.url, type: e.type, requestAt: e.timestamp * 1000, fromCache: false })
  })
  cdp.on('Network.requestServedFromCache', e => {
    const row = requests.get(e.requestId)
    if (row) row.fromCache = true
  })
  cdp.on('Network.responseReceived', e => {
    const row = requests.get(e.requestId)
    if (!row) return
    Object.assign(row, {
      status: e.response.status,
      fromCache: row.fromCache || Boolean(e.response.fromDiskCache || e.response.fromPrefetchCache || e.response.fromServiceWorker),
      headers: Object.fromEntries(Object.entries(e.response.headers).filter(([key]) => /^(cache-control|content-type|vary|etag|timing-allow-origin)$/i.test(key))),
    })
  })
  cdp.on('Network.loadingFinished', e => {
    const row = requests.get(e.requestId)
    if (!row) return
    row.responseBytes = e.encodedDataLength
    row.durationMs = Math.round(e.timestamp * 1000 - row.requestAt)
    if (row.type === 'Stylesheet' && !cssByUrl.has(row.url)) {
      const pending = cdp.send('Network.getResponseBody', { requestId: e.requestId }).then(({ body }) => {
        const faces = [...body.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, block]) => ({
          family: block.match(/font-family:\s*['"]?([^;'"\n]+)/)?.[1]?.trim(),
          weight: block.match(/font-weight:\s*([^;]+)/)?.[1]?.trim(),
          display: block.match(/font-display:\s*([^;]+)/)?.[1]?.trim(),
          url: block.match(/url\(([^)]+)\)/)?.[1]?.replace(/['"]/g, ''),
          unicodeRange: block.match(/unicode-range:\s*([^;]+)/)?.[1]?.trim(),
        }))
        cssByUrl.set(row.url, { url: row.url, textBytes: Buffer.byteLength(body), faces })
      }).catch(error => { row.cssReadError = String(error) }).finally(() => pendingCss.delete(pending))
      pendingCss.add(pending)
    }
  })
  cdp.on('Network.loadingFailed', e => {
    const row = requests.get(e.requestId)
    if (row) row.error = e.errorText
  })
  const output = { name, viewport, network: network || 'native', ...(earlyFacePreview ? { prototype: 'Browser-only early sans CSS; cold-entry experiment, not production code.' } : {}), steps: [] }
  for (const step of steps) {
    requests = new Map()
    documents = []
    if (step.click) {
      await Promise.all([
        page.waitForURL(`${origin}${step.path}`),
        page.locator('.format-switch').getByRole('link', { name: step.click, exact: true }).click(),
      ])
      await page.waitForLoadState('domcontentloaded')
    } else {
      await page.goto(`${origin}${step.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    }
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await document.fonts.ready
      window.__fontAudit.readyObservedAt = performance.now()
    })
    await page.waitForTimeout(500)
    await Promise.allSettled([...pendingCss])
    const performanceData = await page.evaluate(() => ({
      timeOrigin: performance.timeOrigin,
      ...window.__fontAudit,
      paints: performance.getEntriesByType('paint').map(({ name, startTime }) => ({ name, at: startTime })),
      domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
      loadedFontFaces: [...document.fonts].filter(face => face.status === 'loaded').reduce((groups, face) => {
        const key = `${face.family} ${face.weight} ${face.display}`
        groups[key] = (groups[key] || 0) + 1
        return groups
      }, {}),
      computed: ['#work-title', '.format-switch a', '.story-content p', '.lyric-current'].flatMap(selector => {
        const element = document.querySelector(selector)
        if (!element) return []
        const style = getComputedStyle(element)
        return [{ selector, text: element.textContent.trim().slice(0, 100), family: style.fontFamily, weight: style.fontWeight }]
      }),
      links: [...document.querySelectorAll('link[href]')].filter(link => link.href.includes('fonts.') || link.as === 'font').map(link => ({ rel: link.rel, as: link.as, href: link.href })),
    }))
    const root = (await cdp.send('DOM.getDocument')).root
    const platformFonts = []
    for (const selector of ['#work-title', '.format-switch a', '.episode-title', '.story-content p']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (nodeId) platformFonts.push({ selector, ...(await cdp.send('CSS.getPlatformFontsForNode', { nodeId })) })
    }
    const rows = [...requests.values()].map(({ requestAt, ...row }) => row)
    const fonts = rows.filter(row => row.type === 'Font')
    const styles = rows.filter(row => row.type === 'Stylesheet')
    const sum = entries => entries.reduce((n, row) => n + (row.responseBytes || 0), 0)
    output.steps.push({
      label: step.label, path: step.path, navigation: step.click ? 'format link click' : 'direct navigation',
      documents,
      summary: {
        fontRequests: fonts.length,
        fontNetworkResponses: fonts.filter(row => !row.fromCache && row.status).length,
        fontCacheResponses: fonts.filter(row => row.fromCache).length,
        fontNetworkBytes: sum(fonts.filter(row => !row.fromCache)),
        stylesheetRequests: styles.length,
        stylesheetNetworkBytes: sum(styles.filter(row => !row.fromCache)),
        failedRequests: rows.filter(row => row.error).length,
        observedCls: performanceData.shifts.reduce((sum, entry) => sum + entry.value, 0),
      },
      performance: performanceData, platformFonts, requests: rows,
    })
    process.stderr.write(`${name}: ${step.label} ${JSON.stringify(output.steps.at(-1).summary)}\n`)
  }
  const urlMap = new Map([...cssByUrl.values()].flatMap(sheet => sheet.faces.map(face => [face.url, face.family])))
  for (const step of output.steps) {
    step.resourcePolicies = [...new Map(step.requests.filter(row => row.headers).map(row => [row.type, { type: row.type, headers: row.headers }])).values()]
    step.requests = step.requests.map(({ headers, ...row }) => ({ ...row, ...(row.type === 'Font' ? { family: urlMap.get(row.url) } : {}) }))
  }
  output.stylesheets = [...cssByUrl.values()].map(({ faces, ...sheet }) => ({
    ...sheet,
    declaredFaces: faces.length,
    uniqueFontUrls: new Set(faces.map(face => face.url)).size,
    families: [...new Set(faces.map(face => face.family))].map(family => ({
      family,
      weights: [...new Set(faces.filter(face => face.family === family).map(face => face.weight))],
      declaredFaces: faces.filter(face => face.family === family).length,
      uniqueFontUrls: new Set(faces.filter(face => face.family === family).map(face => face.url)).size,
    })),
  }))
  result.journeys.push(output)
  await context.close()
}

async function inspectCssCandidates() {
  const context = await browser.newContext()
  const page = await context.newPage()
  const userAgent = await page.evaluate(() => navigator.userAgent)
  const candidates = []
  for (const [name, weights] of [['current', '400;500;700;800'], ['variable range', '400..800']]) {
    const url = `https://fonts.googleapis.com/css2?family=Hahmlet:wght@${weights}&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap`
    const response = await context.request.get(url, { headers: { 'User-Agent': userAgent } })
    if (!response.ok()) throw new Error(`Font CSS request failed: ${response.status()} ${url}`)
    const body = await response.text()
    const blocks = [...body.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(([, block]) => block)
    candidates.push({ name, url, userAgent, textBytes: Buffer.byteLength(body), gzipBytesEstimate: gzipSync(body).byteLength,
      declaredFaces: blocks.length,
      uniqueFontUrls: new Set(blocks.map(block => block.match(/url\(([^)]+)\)/)?.[1])).size,
      families: ['Hahmlet', 'IBM Plex Sans KR'].map(family => ({ family,
        weights: [...new Set(blocks.filter(block => block.includes(family)).map(block => block.match(/font-weight:\s*([^;]+)/)?.[1]))],
        declaredFaces: blocks.filter(block => block.includes(family)).length,
      })),
    })
  }
  await context.close()
  return candidates
}

const novels = '/novels/bae-byunghee/'
const audiobooks = '/audiobooks/bae-byunghee/'
const toggles = [
  { label: 'cold novel work', path: novels },
  { label: 'first audio switch', path: audiobooks, click: '오디오북' },
  { label: 'return novel', path: novels, click: '소설' },
  { label: 'repeat audio switch', path: audiobooks, click: '오디오북' },
  { label: 'repeat return novel', path: novels, click: '소설' },
]

try {
  await journey('phone tabs', { width: 390, height: 844 }, toggles)
  await journey('desktop tabs', { width: 1440, height: 1000 }, toggles.slice(0, 3))
  await journey('portal entry', { width: 390, height: 844 }, [
    { label: 'cold portal', path: '/' },
    { label: 'novel after portal', path: novels },
    toggles[1],
  ])
  await journey('novel reading', { width: 390, height: 844 }, [
    { label: 'cold prolog', path: `${novels}prolog` },
    { label: 'next episode', path: `${novels}ep01` },
  ])
  await journey('novel sans reading', { width: 390, height: 844 }, [
    { label: 'cold prolog with saved sans preference', path: `${novels}prolog` },
  ], undefined, { 'family-library:face': 'sans' })
  await journey('early sans preference prototype', { width: 390, height: 844 }, [
    { label: 'cold prolog with early sans CSS', path: `${novels}prolog` },
  ], undefined, { 'family-library:face': 'sans' }, true)
  await journey('audio listening', { width: 390, height: 844 }, [
    { label: 'cold audio prolog', path: `${audiobooks}prolog` },
  ])
  await journey('throttled phone tabs', { width: 390, height: 844 }, toggles.slice(0, 3), {
    offline: false, latency: 150, downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8,
  })
  result.cssCandidates = await inspectCssCandidates()
  result.deploymentAtCompletion = await (await fetch(`${origin}/deployment.json`)).json()
  result.deploymentChanged = result.deployment.sourceRevision !== result.deploymentAtCompletion.sourceRevision
  result.completedAt = new Date().toISOString()
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
