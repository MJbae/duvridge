import { test, expect, type Page } from '@playwright/test'

const novel = '/novels/bae-byunghee/'
const audio = '/audiobooks/bae-byunghee/'
const ready = async (page: Page) => page.evaluate(async () => { await document.fonts.ready })
const fontRequests = (page: Page) => page.evaluate(() => performance.getEntriesByType('resource')
  .filter(entry => /\/fonts\/.*\.(woff2|css)$/.test(entry.name))
  .map(entry => ({ url: entry.name, bytes: (entry as PerformanceResourceTiming).transferSize })))

test('the portal and both formats share local fonts and retain the HTTP cache across tab changes', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => { if (/fonts\.(googleapis|gstatic)\.com/.test(request.url())) external.push(request.url()) })
  await page.goto('/')
  await ready(page)
  const stylesheet = await page.locator('#reader-fonts').getAttribute('href')
  expect(stylesheet).toMatch(/^\/fonts\/reader\.[a-f0-9]{16}\.css$/)
  await page.goto(novel)
  await ready(page)
  expect(await page.locator('#reader-fonts').getAttribute('href')).toBe(stylesheet)
  for (const [name, path] of [['오디오북', audio], ['소설', novel], ['오디오북', audio]] as const) {
    await page.locator('.format-switch').getByRole('link', { name, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await ready(page)
    const resources = await fontRequests(page)
    expect(resources.length).toBeGreaterThan(0)
    expect(resources.every(entry => entry.bytes === 0)).toBe(true)
    expect(await page.locator('#reader-fonts').getAttribute('href')).toBe(stylesheet)
  }
  expect(external).toEqual([])
})

test('a cold work home stays within the font budget and displays the real serif face', async ({ page }) => {
  await page.goto(novel)
  await ready(page)
  const fonts = (await fontRequests(page)).filter(entry => entry.url.endsWith('.woff2'))
  expect(fonts.length).toBeGreaterThan(0)
  expect(fonts.reduce((bytes, entry) => bytes + entry.bytes, 0)).toBeLessThan(200_000)
  const loaded = await page.evaluate(() => [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family))
  expect(loaded.some(font => font.includes('ToldLife Serif'))).toBe(true)
  expect(loaded.some(font => font.includes('ToldLife UI'))).toBe(true)
  await expect(page.locator('#work-title')).toHaveText('내 논을 파는 한이 있어도')
})

test('saved sans applies to server-rendered text even if the app JavaScript never arrives', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('family-library:face', 'sans')
    localStorage.setItem('family-library:font', '2')
    localStorage.setItem('family-library:leading', 'normal')
  })
  // This scenario intentionally blocks hydration; it does not measure cache reuse.
  await page.route('**/*.js', route => route.abort())
  await page.goto(`${novel}prolog`)
  await ready(page)
  const paragraph = page.locator('.story-content p').first()
  await expect(paragraph).toBeVisible()
  const style = await paragraph.evaluate(element => {
    const style = getComputedStyle(element)
    return { family: style.fontFamily, size: style.fontSize, leading: parseFloat(style.lineHeight) / parseFloat(style.fontSize) }
  })
  expect(style.family).toContain('ToldLife UI')
  expect(style.size).toBe('23px')
  expect(style.leading).toBeCloseTo(1.85, 3)
  const fonts = (await fontRequests(page)).filter(entry => entry.url.endsWith('.woff2'))
  expect(fonts.some(font => font.url.includes('/serif'))).toBe(false)
  expect(fonts.reduce((bytes, font) => bytes + font.bytes, 0)).toBeLessThan(300_000)
})

test('saved typography, subsequent face changes and reloads remain synchronized', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('font-test-started')) {
      localStorage.setItem('family-library:face', 'sans')
      localStorage.setItem('family-library:font', '2')
      localStorage.setItem('font-test-started', '1')
    }
  })
  await page.goto(`${novel}prolog`)
  await ready(page)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '읽기 설정' })
  await expect(settings.getByRole('button', { name: '고딕', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await settings.getByRole('button', { name: '명조', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reader-face', 'serif')
  await expect(page.locator('.library')).toHaveClass(/face-serif/)
  await page.reload()
  await ready(page)
  expect(await page.locator('.story-content p').first().evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife Serif')
  await expect(page.locator('html')).toHaveAttribute('data-reader-font', '2')
})

test('blocked storage and failed font transfers keep the reader usable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('Storage blocked') } })
  await page.route('**/fonts/*.woff2', route => route.abort())
  await page.goto(`${novel}prolog`)
  await expect(page.locator('.story-content p').first()).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-reader-face', 'serif')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '읽기 설정' })
  await expect(settings).toBeVisible()
  await settings.getByRole('button', { name: '고딕', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-reader-face', 'sans')
})
