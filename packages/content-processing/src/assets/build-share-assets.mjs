import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'
import { bookSource } from './asset-files.mjs'

/** Build mobile icons and the web manifest; preserve the approved sharing image. */
export async function buildShareAssets({ source, book }) {
  const root = bookSource(source, book)
  const title = book.work?.title
  if (typeof title !== 'string' || !title.trim()) throw new Error('The book title is required for sharing assets.')
  const publicDirectory = resolve(root, 'public')
  const icon = await readFile(resolve(publicDirectory, 'favicon.svg'), 'utf8')
  const manifest = {
    name: title,
    short_name: title,
    description: book.webManifest?.description ?? book.sharing?.description ?? [title, book.work.subtitle].filter(Boolean).join(' — '),
    lang: book.webManifest?.lang ?? book.language ?? book.lang ?? 'ko',
    id: './',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
  const browser = await chromium.launch({ headless: true })
  const outputs = []
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 })
    for (const [filename, size] of [
      ['favicon-32.png', 32],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ]) {
      await page.setViewportSize({ width: size, height: size })
      // Apple applies its own corner mask to home-screen icons.
      const artwork = filename === 'apple-touch-icon.png' ? icon.replace('rx="14"', 'rx="0"') : icon
      await page.setContent(`<!doctype html><html><head><style>
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; background: transparent; }
        svg { display: block; width: 100%; height: 100%; }
      </style></head><body>${artwork}</body></html>`)
      outputs.push({ path: resolve(publicDirectory, filename), data: await page.screenshot({ omitBackground: true }) })
    }
    await page.close()
  } finally {
    await browser.close()
  }
  await mkdir(publicDirectory, { recursive: true })
  for (const output of outputs) await writeFile(output.path, output.data)
  const manifestPath = resolve(publicDirectory, 'site.webmanifest')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return { files: [...outputs.map(output => output.path), manifestPath] }
}
