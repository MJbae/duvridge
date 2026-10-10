import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }

const music = () => rawCatalog.music!
const backgroundAudio = (page: Page) => page.locator('.background-audio')
const musicSwitch = (page: Page) => page.getByRole('switch', { name: '배경음악', exact: true })
async function openSettings(page: Page) {
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  if (!await page.getByRole('dialog', { name: '읽기 설정' }).isVisible())
    await page.getByRole('button', { name: '설정', exact: true }).click()
}
async function playing(page: Page, src: string) {
  await expect(backgroundAudio(page)).toHaveAttribute('src', `/novels${src}`)
  await expect.poll(() => backgroundAudio(page).evaluate((audio: HTMLAudioElement) =>
    !audio.paused && audio.readyState >= 2 && Number.isFinite(audio.duration) && audio.duration > 0)).toBe(true)
  await expect(page.locator('.music-toggle')).toHaveAttribute('aria-checked', 'true')
}
async function startMusic(page: Page, src: string) {
  await openSettings(page)
  if (await page.locator('.music-toggle').getAttribute('aria-checked') === 'false') await musicSwitch(page).click()
  await expect.poll(async () => await backgroundAudio(page).evaluate((audio: HTMLAudioElement) => !audio.paused) ||
    await page.locator('.music-retry').isVisible()).toBeTruthy()
  if (await page.locator('.music-retry').isVisible()) await page.locator('.music-retry').click()
  await playing(page, src)
  await page.keyboard.press('Escape')
}
async function fixedVolume(page: Page) {
  expect(await backgroundAudio(page).evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(0.12)
}

test('작품 홈은 조용하고, 회차는 설정 안 스위치 하나로 그 회차의 곡을 켜고 끈다', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/music/')) requests.push(request.url()) })
  await page.goto('./')
  await expect(backgroundAudio(page)).not.toHaveAttribute('src')
  await expect(page.locator('.music-toggle')).toHaveCount(0)
  expect(requests).toEqual([])
  await page.locator('.work-action .big-button').click()
  await expect(page).toHaveURL(/bae-byunghee\/prolog$/)
  await startMusic(page, music().episodes.prolog.src)
  await fixedVolume(page)
  await expect(page.locator('.reader-bar .music-toggle')).toHaveCount(0)
  await openSettings(page)
  await expect(page.getByRole('slider')).toHaveCount(0)
  await musicSwitch(page).click()
  await expect.poll(() => backgroundAudio(page).evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:music') || '{}'))).toEqual({ enabled: false })
  await page.reload()
  await openSettings(page)
  await expect(page.locator('.music-toggle')).toHaveAttribute('aria-checked', 'false')
  await expect(backgroundAudio(page)).not.toHaveAttribute('src')
})

test('하나의 재생기로 모든 회차의 곡을 12% 음량으로 이어 틀고, 마지막 회차 뒤에는 조용히 작품 홈으로 돌아온다', async ({ page }) => {
  test.setTimeout(120000)
  const errors: string[] = []
  const broken: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().includes('/music/') && !response.ok()) broken.push(response.url()) })
  await page.goto('prolog')
  const audio = (await backgroundAudio(page).elementHandle())!
  await startMusic(page, music().episodes.prolog.src)
  for (const episode of rawCatalog.readingOrder) {
    await expect(page).toHaveURL(new RegExp(`${episode.url}$`))
    const track = music().episodes[episode.episodeId as keyof ReturnType<typeof music>['episodes']]
    await playing(page, track.src)
    await fixedVolume(page)
    expect(await audio.evaluate(element => element === document.querySelector('.background-audio'))).toBe(true)
    const next = page.locator('.episode-nav .big-button')
    if (episode === rawCatalog.readingOrder.at(-1)) await expect(next).toBeDisabled()
    else await next.click()
  }
  // After the last episode there is no next one: the reader leaves by the work-home arrow.
  await page.getByRole('link', { name: '작품 홈으로' }).click()
  await expect(page.locator('.work-home')).toBeVisible()
  await expect.poll(() => backgroundAudio(page).evaluate((element: HTMLAudioElement) => element.paused)).toBe(true)
  expect(broken).toEqual([])
  expect(errors).toEqual([])
})

test('키보드로 설정과 음악 스위치를 조작한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-library:music', JSON.stringify({ enabled: false })))
  await page.goto('ep01')
  await page.getByRole('button', { name: '설정', exact: true }).focus()
  await page.keyboard.press('Enter')
  const control = musicSwitch(page)
  expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await control.focus()
  await page.keyboard.press('Space')
  await playing(page, '/works/bae-byunghee/music/ep01.mp3')
  await page.keyboard.press('Space')
  await expect(control).toHaveAttribute('aria-checked', 'false')
  expect(await backgroundAudio(page).evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '설정', exact: true })).toBeFocused()
})

test('음악을 받지 못하면 설정에만 알리고 다시 재생할 수 있으며 본문은 그대로다', async ({ page }) => {
  await page.route('**/music/ep01.mp3', route => route.abort())
  await page.goto('ep01')
  await openSettings(page)
  await expect.poll(() => backgroundAudio(page).evaluate((audio: HTMLAudioElement) => Boolean(audio.error))).toBe(true)
  await expect(page.locator('#music-setting-status')).toContainText('음악을 불러오지 못했어요')
  expect((await page.getByRole('button', { name: '다시 재생' }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await page.unroute('**/music/ep01.mp3')
  await page.getByRole('button', { name: '다시 재생' }).click()
  await playing(page, '/works/bae-byunghee/music/ep01.mp3')
  await page.keyboard.press('Escape')
  await expect(page.locator('.story-content p').first()).toBeVisible()
})

test('기기의 기본 음량이 고정되어 있어도 12%로 재생하고 스위치로 중지한다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', { get: () => 1, set() {}, configurable: true })
    const original = AudioContext.prototype.createGain
    AudioContext.prototype.createGain = function () {
      const gain = original.call(this)
      Object.assign(window, { musicGain: gain, musicContext: this })
      return gain
    }
  })
  const gainValue = () => page.evaluate(() => (window as typeof window & { musicGain: GainNode }).musicGain.gain.value)
  await page.goto('prolog')
  await startMusic(page, '/works/bae-byunghee/music/prolog.mp3')
  await expect.poll(gainValue).toBeCloseTo(0.12, 3)
  await openSettings(page)
  await musicSwitch(page).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicContext: AudioContext }).musicContext.state)).toBe('suspended')
  await musicSwitch(page).click()
  await playing(page, '/works/bae-byunghee/music/prolog.mp3')
  await expect.poll(gainValue).toBeCloseTo(0.12, 3)
})
