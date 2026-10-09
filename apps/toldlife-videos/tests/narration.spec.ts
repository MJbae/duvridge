import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }
import { cueIndexAt, type NarrationCue } from '../site/.vitepress/shared/narration-cues.mjs'

type Track = { src: string; duration: number; cues: NarrationCue[]; texts: string[]; scenes: [number, string][] }
const catalog = rawCatalog as unknown as { video: Record<string, Track>; narration: Record<string, Track> }
const video = catalog.video
const player = (page: Page) => page.locator('.stage-video')
const currentTime = (page: Page) => player(page).evaluate((media: HTMLVideoElement) => media.currentTime)
const playButton = (page: Page) => page.locator('[data-reader-ready="true"]').getByRole('button', { name: '재생', exact: true })
const pauseButton = (page: Page) => page.getByRole('button', { name: '일시 정지', exact: true })
const bigButton = (page: Page) => page.locator('[data-reader-ready="true"] .work-action .big-button')
// How far an element sits from the middle of the screen.
const offCenter = (page: Page, selector: string) => page.locator(selector).evaluate(element => {
  const box = element.getBoundingClientRect()
  return Math.abs(box.top + box.height / 2 - innerHeight / 2)
})

async function watching(page: Page, id: string) {
  await expect(player(page)).toHaveAttribute('src', `/videos${video[id].src}`)
  await expect.poll(() => player(page).evaluate((media: HTMLVideoElement) => !media.paused && media.readyState >= 2)).toBe(true)
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

test('영상 작품 홈은 보기만 보여 주고, 큰 버튼은 자막이 든 영상을 그대로 바로 튼다', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await expect(bigButton(page)).toHaveText('처음부터 보기')
  await expect(page.getByText(/듣기|읽기/)).toHaveCount(0)
  await expect(page.locator('.episode-item:visible')).toHaveCount(26)
  await bigButton(page).click()
  await expect(page).toHaveURL(/\/videos\/bae-byunghee\/prolog$/)
  await watching(page, 'prolog')
  // The subtitles are in the video itself: no subtitle button, band or overlay.
  await expect(page.getByRole('button', { name: /자막/ })).toHaveCount(0)
  await expect(page.locator('.subtitle-band, .stage-caption')).toHaveCount(0)
})

test('장면을 누르면 영상에서 그 장면부터 본다', async ({ page }) => {
  await page.goto('prolog')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await playButton(page).click()
  await watching(page, 'prolog')
  const scenes = page.locator('.scene-card')
  await expect(scenes).toHaveCount(video.prolog.scenes.length)
  await scenes.nth(1).click()
  const second = video.prolog.cues[video.prolog.scenes[1][0]][0]
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(second - 0.3)
  await expect(scenes.nth(1)).toHaveAttribute('aria-current', 'true')
})

test('오디오북에서 멈춘 문장부터 영상이 이어지고, 멈추면 그 자리를 오디오북의 시각으로 남긴다', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('seeded')) return
    localStorage.setItem('seeded', '1')
    localStorage.setItem('family-library:bae-byunghee:narration', JSON.stringify({ id: 'prolog', time: 30 }))
  })
  const recording = catalog.narration.prolog
  const sentence = cueIndexAt(recording.cues, 30)
  await page.goto('./')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await expect(bigButton(page)).toHaveText('프롤로그 이어 보기')
  await bigButton(page).click()
  await watching(page, 'prolog')
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(video.prolog.cues[sentence][0] - 0.3)
  await pauseButton(page).click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:narration')!))
  expect(saved.id).toBe('prolog')
  expect(cueIndexAt(recording.cues, saved.time)).toBe(sentence)
})

test('작품 홈으로 돌아가면 영상이 멈추고, 본 회차가 목록 가운데 온다', async ({ page }) => {
  await page.goto('ep03')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await playButton(page).click()
  await watching(page, 'ep03')
  if (!(await page.locator('.stage-controls').count())) await page.locator('.stage-frame').click()
  await page.locator('.stage-controls').getByRole('link', { name: '작품 홈으로' }).click()
  await expect(page).toHaveURL(/\/bae-byunghee\/#episode-ep03$/)
  await expect(player(page)).toHaveCount(0)
  await expect(bigButton(page)).toHaveText('3화 이어 보기')
  await expect.poll(() => offCenter(page, '#episode-ep03')).toBeLessThan(40)
})

test('가로로 돌리면 영상이 화면을 채우고 따로 그린 자막은 없다', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('prolog')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await expect(page.locator('.theater-page')).toHaveClass(/is-full/)
  await expect(page.locator('.subtitle-band, .stage-caption')).toHaveCount(0)
  await noOverflow(page)
})

test('영상은 배경음악을 불러오지 않는다', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/music/')) requests.push(request.url()) })
  await page.goto('prolog')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await playButton(page).click()
  await watching(page, 'prolog')
  await expect(page.locator('.background-audio')).toHaveCount(0)
  expect(requests).toEqual([])
})
