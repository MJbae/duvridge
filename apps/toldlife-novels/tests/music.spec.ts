import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }

async function openSettings(page: Page) {
  if (!await page.getByRole('dialog').isVisible())
    await page.getByRole('button', { name: '설정', exact: true }).click()
}
async function playing(page: Page, src: string) {
  await expect(page.locator('.background-audio')).toHaveAttribute('src', `/novels${src}`)
  await expect.poll(() => page.locator('.background-audio').evaluate((audio: HTMLAudioElement) =>
    !audio.paused && audio.readyState >= 2 && Number.isFinite(audio.duration) && audio.duration > 0)).toBe(true)
  await expect(page.locator('.music-toggle')).toHaveAttribute('aria-checked', 'true')
}
async function startMusic(page: Page, src: string) {
  await openSettings(page)
  if (await page.locator('.music-toggle').getAttribute('aria-checked') === 'false')
    await page.getByRole('switch', { name: '배경음악', exact: true }).click()
  await expect.poll(async () => await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => !audio.paused) ||
    await page.locator('.music-retry').isVisible()).toBeTruthy()
  if (await page.locator('.music-retry').isVisible()) await page.locator('.music-retry').click()
  await playing(page, src)
  await page.keyboard.press('Escape')
}
async function fixedVolume(page: Page) {
  expect(await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => audio.volume)).toBe(0.03)
}

test('기본 재생을 유지하며 음악 제어는 홈과 회차의 통합 설정에만 표시한다', async ({ page }, info) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    let first = true
    HTMLMediaElement.prototype.play = function () {
      if (first) { first = false; return Promise.reject(new DOMException('Gesture required', 'NotAllowedError')) }
      return play.call(this)
    }
  })
  await page.goto('./')
  await expect(page.locator('.home-heading-tools .settings-button')).toHaveCount(1)
  await expect(page.locator('.home-heading .music-toggle, .reader-toolbar .music-toggle')).toHaveCount(0)
  await expect(page.locator('.background-audio')).toHaveAttribute('src', '/novels/music/intro.mp3')
  await fixedVolume(page)
  await page.locator('.resume-link').click()
  await playing(page, '/music/prolog.mp3')
  await expect(page.locator('.reader-toolbar a, .reader-toolbar button')).toHaveCount(2)
  await openSettings(page)
  await expect(page.getByRole('switch', { name: '배경음악', exact: true })).toBeVisible()
  await expect(page.getByRole('slider')).toHaveCount(0)
  await fixedVolume(page)
  await page.screenshot({ path: `test-results/reading/${info.project.name}-music-settings.png` })
})

test('일시정지 위치와 꺼짐 선택을 기억하고 설정에서 켜면 이어 재생한다', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('family-library:music'))
      localStorage.setItem('family-library:music', JSON.stringify({ enabled: false, volume: 1 }))
  })
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/music/')) requests.push(request.url()) })
  await page.goto('./')
  await expect(page.locator('.background-audio')).not.toHaveAttribute('src')
  expect(requests).toEqual([])
  await startMusic(page, '/music/intro.mp3')
  await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => { audio.currentTime = 12 })
  await openSettings(page)
  await page.getByRole('switch', { name: '배경음악' }).click()
  const pausedAt = await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)
  expect(pausedAt).toBeGreaterThanOrEqual(12)
  expect(await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await page.getByRole('switch', { name: '배경음악' }).click()
  await playing(page, '/music/intro.mp3')
  const resumedAt = await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => audio.currentTime)
  expect(resumedAt).toBeGreaterThanOrEqual(pausedAt)
  expect(resumedAt - pausedAt).toBeLessThan(1)
  await fixedVolume(page)
  await page.getByRole('switch', { name: '배경음악' }).click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:music') || '{}'))).toEqual({ enabled: false })
  await page.keyboard.press('Escape')
  await page.locator('.resume-link').click()
  await expect(page.locator('.background-audio')).not.toHaveAttribute('src')
  await page.reload()
  await expect(page.locator('.music-toggle')).toHaveAttribute('aria-checked', 'false')
  await startMusic(page, '/music/prolog.mp3')
})

test('하나의 재생기로 홈과 모든 회차의 27곡을 3% 음량으로 재생한다', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  const broken: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.url().includes('/music/') && !response.ok()) broken.push(response.url()) })
  await page.goto('./')
  const audio = (await page.locator('.background-audio').elementHandle())!
  await startMusic(page, rawCatalog.music!.home.src)
  await page.locator('.resume-link').click()
  for (const episode of rawCatalog.readingOrder) {
    await expect(page).toHaveURL(new RegExp(`${episode.url}$`))
    const track = rawCatalog.music!.episodes[episode.episodeId as keyof typeof rawCatalog.music.episodes]
    await playing(page, track.src)
    await fixedVolume(page)
    expect(await audio.evaluate(element => element === document.querySelector('.background-audio'))).toBe(true)
    await page.locator('.next-episode').click()
  }
  await playing(page, rawCatalog.music!.home.src)
  expect(broken).toEqual([])
  expect(errors).toEqual([])
})

test('키보드로 설정과 음악 스위치를 조작한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-library:music', JSON.stringify({ enabled: false })))
  await page.goto('read/ep01.html')
  await page.getByRole('button', { name: '설정', exact: true }).focus()
  await page.keyboard.press('Enter')
  const control = page.getByRole('switch', { name: '배경음악' })
  await control.focus()
  await page.keyboard.press('Space')
  await playing(page, '/music/ep01.mp3')
  await page.keyboard.press('Space')
  await expect(control).toHaveAttribute('aria-checked', 'false')
  expect(await page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '설정', exact: true })).toBeFocused()
})

test('음악 오류를 설정에서 확인하고 재시도해도 본문과 목차는 유지된다', async ({ page }) => {
  await page.route('**/music/intro.mp3', route => route.abort())
  await page.goto('./')
  await openSettings(page)
  await expect.poll(() => page.locator('.background-audio').evaluate((audio: HTMLAudioElement) => Boolean(audio.error))).toBe(true)
  await expect(page.locator('#music-setting-status')).toHaveText('음악을 불러오지 못했어요')
  await expect(page.getByRole('button', { name: '음악 다시 재생' })).toBeVisible()
  await page.unroute('**/music/intro.mp3')
  await page.getByRole('button', { name: '음악 다시 재생' }).click()
  await playing(page, '/music/intro.mp3')
  await page.keyboard.press('Escape')
  await expect(page.locator('.chapter-row')).toHaveCount(26)
  await page.locator('.resume-link').click()
  await expect(page.locator('.story-content')).toBeVisible()
})

test('기기의 기본 음량이 고정되어 있어도 3%로 재생하고 스위치로 중지한다', async ({ page }) => {
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
  await page.goto('./')
  await startMusic(page, '/music/intro.mp3')
  await expect.poll(gainValue).toBeCloseTo(0.03, 3)
  await page.locator('.resume-link').click()
  await playing(page, '/music/prolog.mp3')
  await openSettings(page)
  await page.getByRole('switch', { name: '배경음악' }).click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { musicContext: AudioContext }).musicContext.state)).toBe('suspended')
  await page.getByRole('switch', { name: '배경음악' }).click()
  await playing(page, '/music/prolog.mp3')
  await expect.poll(gainValue).toBeCloseTo(0.03, 3)
})
