import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }
import { resumeStart } from '../site/.vitepress/shared/playback-selection.mjs'
import type { NarrationCue } from '../site/.vitepress/shared/narration-cues.mjs'

type Track = { src: string; duration: number; cues: NarrationCue[]; texts: string[]; scenes: [number, string][] }
const narration = (rawCatalog as unknown as { narration: Record<string, Track> }).narration
const recorded = Object.keys(narration).length
const readingOrder = rawCatalog.readingOrder
// Episodes are recorded one at a time; the '준비 중' checks use the first one still waiting, if any.
const waiting = readingOrder.find(entry => !narration[entry.id])
const nameOf = (entry: (typeof readingOrder)[number]) => (entry.number ? `${entry.label} ${entry.title}` : `${entry.label} · ${entry.title}`)
const audio = (page: Page) => page.locator('.narration-audio')
const currentTime = (page: Page) => audio(page).evaluate((media: HTMLAudioElement) => media.currentTime)
const playButton = (page: Page) => page.locator('[data-reader-ready="true"]').getByRole('button', { name: '재생', exact: true })
const pauseButton = (page: Page) => page.getByRole('button', { name: '일시 정지', exact: true })
const bigButton = (page: Page) => page.locator('[data-reader-ready="true"] .work-action .big-button')
const nextButton = (page: Page) => page.locator('.next-episode .big-button')

async function listening(page: Page, id: string) {
  await expect(audio(page)).toHaveAttribute('src', `/videos/works/bae-byunghee/record/${id}.mp3`)
  await expect.poll(() => audio(page).evaluate((media: HTMLAudioElement) => !media.paused && media.readyState >= 2)).toBe(true)
}
async function jumpTo(page: Page, seconds: number) {
  await audio(page).evaluate((media: HTMLAudioElement, at: number) => { media.currentTime = at }, seconds)
}
async function setRange(page: Page, name: string, value: number) {
  await page.getByRole('slider', { name }).evaluate((input: HTMLInputElement, next: number) => {
    input.value = String(next)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function startEpisode(page: Page, id: string, _format: 'read' = 'read') {
  await page.goto(`${id}`)
  await playButton(page).click()
  await listening(page, id)
}

test('영상 작품 홈과 영상은 보기만 보여 주고, 장면을 누르면 그 장면부터 본다', async ({ page }) => {
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('처음부터 보기')
  await expect(page.getByText(/듣기|읽기/)).toHaveCount(0)
  await page.goto('prolog')
  const captions = page.getByRole('button', { name: '자막 끄기' })
  await expect(page.locator('.subtitle-band')).toHaveText(narration.prolog.texts[0])
  await captions.click()
  await expect(page.locator('.subtitle-band')).toHaveCount(0)
  await page.getByRole('button', { name: '자막 켜기' }).click()
  await playButton(page).click()
  await listening(page, 'prolog')
  const scenes = page.locator('.scene-card')
  await expect(scenes).toHaveCount(narration.prolog.scenes.length)
  await scenes.nth(1).click()
  const second = narration.prolog.cues[narration.prolog.scenes[1][0]][0]
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(second - 0.3)
  await expect(scenes.nth(1)).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('.subtitle-band')).toHaveText(narration.prolog.texts[narration.prolog.scenes[1][0]])
})


test('가로로 돌리면 영상이 화면을 채우고 자막이 그림 위에 겹친다', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('prolog')
  await expect(page.locator('.theater-page')).toHaveClass(/is-full/)
  await expect(page.locator('.stage-caption')).toHaveText(narration.prolog.texts[0])
  await expect(page.locator('.subtitle-band')).toHaveCount(0)
  await noOverflow(page)
})


test('영상은 배경음악을 불러오지 않는다', async ({ page }) => {
 const requests: string[] = []
 page.on('request', request => { if (request.url().includes('/music/')) requests.push(request.url()) })
 await page.goto('./')
 await startEpisode(page, 'prolog')
 await expect(page.locator('.background-audio')).toHaveCount(0)
 expect(requests).toEqual([])
})
