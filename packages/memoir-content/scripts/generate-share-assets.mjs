import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// Regenerate with: node scripts/generate-share-assets.mjs
// Generates mobile icons and the manifest. Sharing uses the approved watercolor
// image in site/public/images/ directly, without regenerating the illustration.
// No external image or font request is made.
const publicDirectory = fileURLToPath(new URL('../site/public/', import.meta.url))
const icon = await readFile(`${publicDirectory}/favicon.svg`, 'utf8')
const browser = await chromium.launch({ headless: true })

try {
  await mkdir(publicDirectory, { recursive: true })
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  for (const [filename, size] of [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    await page.setViewportSize({ width: size, height: size })
    // Apple applies its own corner mask to home-screen icons.
    const source = filename === 'apple-touch-icon.png'
      ? icon.replace('rx="14"', 'rx="0"')
      : icon
    await page.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; background: transparent; }
      svg { display: block; width: 100%; height: 100%; }
    </style></head><body>${source}</body></html>`)
    await page.screenshot({ path: `${publicDirectory}/${filename}`, omitBackground: true })
  }

  await page.close()

  await writeFile(`${publicDirectory}/site.webmanifest`, JSON.stringify({
    name: '내 논을 파는 한이 있어도',
    short_name: '내 논을 파는 한이 있어도',
    description: '내 논을 파는 한이 있어도 — 배병희 자전소설',
    lang: 'ko',
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
  }, null, 2) + '\n')
} finally {
  await browser.close()
}

console.log('Generated mobile icons and the web manifest. Sharing uses the existing watercolor image.')
