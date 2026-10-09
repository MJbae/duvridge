import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('all old endpoints return one 301 and an existing clean destination', async ({ request }) => {
  const redirects = JSON.parse(readFileSync('.deploy/work-url-fixture/redirects.json', 'utf8')) as { from: string; to: string }[]
  for (const row of redirects) {
    const response = await request.get(row.from, { maxRedirects: 0 })
    expect(response.status(), row.from).toBe(301)
    expect(response.headers().location, row.from).toBe(row.to)
    const destination = await request.get(row.to, { maxRedirects: 0 })
    expect(destination.status(), row.to).toBe(200)
  }
})
test('format roots open the right portal tab and the old video fragment works', async ({ page }) => {
  for (const format of ['novels', 'audiobooks', 'videos']) {
    await page.goto(`/${format}/`)
    await expect(page).toHaveURL(new RegExp(`\\?tab=${format}$`))
    await expect(page.locator('.panel.is-active')).toHaveAttribute('id', format)
    await expect(page.locator('.panel.is-active .works a')).toHaveCount(2)
    await page.locator('.panel.is-active .works a').nth(1).click()
    await expect(page).toHaveURL(new RegExp(`/${format}/url-rehearsal/$`))
    await expect(page.getByRole('heading', { name: '주소 검증 작품', exact: true })).toBeVisible()
  }
  await page.goto('/#video')
  await expect(page.locator('#videos')).toHaveClass(/is-active/)
  await page.getByRole('link', { name: '영상', exact: true }).click()
  await expect(page).toHaveURL(/#videos$/)
})
test('legacy reading records copy once, preserve originals, and never enter the second work', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded')) return
    localStorage.setItem('seeded', '1')
    localStorage.setItem('family-library:reading', JSON.stringify({ id: 'ep01', scroll: 420, progress: .3, finished: false }))
    localStorage.setItem('family-library:completed', JSON.stringify(['ep02']))
    localStorage.setItem('family-library:music', JSON.stringify({ enabled: false }))
  })
  await page.goto('/novels/bae-byunghee/')
  await expect(page.locator('[data-reader-ready="true"] .work-action .big-button')).toHaveText('1화 이어 읽기')
  const old = await page.evaluate(() => localStorage.getItem('family-library:reading'))
  await page.locator('[data-reader-ready="true"] .work-action .big-button').click()
  await expect(page).toHaveURL(/bae-byunghee\/ep01$/)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300)
  await page.goto('/novels/url-rehearsal/')
  await expect(page.locator('[data-reader-ready="true"] .work-action .big-button')).toHaveText('처음부터 읽기')
  expect(await page.evaluate(() => localStorage.getItem('family-library:reading'))).toBe(old)
  expect(await page.evaluate(() => localStorage.getItem('family-library:url-rehearsal:reading'))).toBeNull()
  await page.locator('[data-reader-ready="true"] .work-action .big-button').click()
  await expect(page.locator('.story-content')).toContainText('두 번째 작품의 첫 회차 본문입니다.')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:url-rehearsal:reading')!).id)).toBe('ep01')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:completed')!))).toEqual(['ep02'])
})
test('narration history is shared across audio and video within a work', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded')) return
    localStorage.setItem('seeded', '1')
    localStorage.setItem('family-library:narration', JSON.stringify({ id: 'prolog', time: 30 }))
  })
  await page.goto('/audiobooks/bae-byunghee/')
  await expect(page.locator('[data-reader-ready="true"] .work-action .big-button')).toHaveText('프롤로그 이어 듣기')
  await page.goto('/videos/bae-byunghee/')
  await expect(page.locator('[data-reader-ready="true"] .work-action .big-button')).toHaveText('프롤로그 이어 보기')
  await page.goto('/audiobooks/url-rehearsal/')
  await expect(page.locator('[data-reader-ready="true"] .work-action .big-button')).toHaveText('처음부터 듣기')
  await page.locator('[data-reader-ready="true"] .work-action .big-button').click()
  await expect(page.locator('.narration-audio')).toHaveAttribute('src', '/audiobooks/works/url-rehearsal/record/ep01.mp3')
  await page.goto('/videos/url-rehearsal/')
  await expect(page.locator('[data-reader-ready="true"] .work-action .big-button')).toHaveText('1화 이어 보기')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:narration')!))).toEqual({ id: 'prolog', time: 30 })
})
test('catalog chunks and images belong to the requested work; unknown endpoints are 404', async ({ page, request }) => {
  const catalogs: string[] = []
  page.on('request', req => { if (/\/assets\/chunks\/(?:bae-byunghee|url-rehearsal)[^.]*\..*\.js/.test(req.url()) && !req.url().includes('ep01')) catalogs.push(req.url()) })
  await page.goto('/novels/url-rehearsal/ep01')
  await expect(page.locator('.story-content')).toContainText('두 번째 작품의 첫 회차 본문입니다.')
  await page.locator('.reader-back').click()
  await expect(page.locator('.work-art img')).toHaveAttribute('src', /works\/url-rehearsal\/images/)
  expect(catalogs.some(url => /\/assets\/chunks\/url-rehearsal\.[^.]+\.js/.test(url))).toBe(true)
  expect(catalogs.some(url => /\/assets\/chunks\/bae-byunghee\.[^.]+\.js/.test(url))).toBe(false)
  expect((await request.get('/novels/unknown/ep01')).status()).toBe(404)
})
test('old links preserve fragments and the story renders without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4190/novels/read/josae.html#reactions')
  await expect(page).toHaveURL(/novels\/bae-byunghee\/ep01#reactions$/)
  await expect(page.locator('.story-content')).toBeVisible()
  await expect(page.locator('.episode-illustration img').first()).toBeVisible()
  await context.close()
})

test('approved audio remains readable through a range request at the work media endpoint', async ({ request }) => {
  for (const format of ['audiobooks', 'videos']) {
    const response = await request.get(`/${format}/works/bae-byunghee/record/prolog.mp3`, { headers: { Range: 'bytes=0-1023' } })
    expect(response.status()).toBe(206)
    expect(response.headers()['content-range']).toMatch(/^bytes 0-1023\//)
    expect((await response.body()).byteLength).toBe(1024)
  }
})
