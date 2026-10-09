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
const playButton = (page: Page) => page.getByRole('button', { name: '재생', exact: true })
const pauseButton = (page: Page) => page.getByRole('button', { name: '일시 정지', exact: true })
const bigButton = (page: Page) => page.locator('.work-action .big-button')
const nextButton = (page: Page) => page.locator('.next-episode .big-button')

async function listening(page: Page, id: string) {
  await expect(audio(page)).toHaveAttribute('src', `/audiobooks/works/bae-byunghee/record/${id}.mp3`)
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

test('오디오북 작품 홈은 큰 버튼 하나와 듣기 회차만 보여 준다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1, name: '내 논을 파는 한이 있어도' })).toBeVisible()
  await expect(bigButton(page)).toHaveText('처음부터 듣기')
  await expect(bigButton(page)).toHaveAttribute('href', '/audiobooks/bae-byunghee/prolog')
  await expect(page.locator('.episode-item')).toHaveCount(26)
  await expect(page.locator('.episode-item:visible')).toHaveCount(5)
  await expect(page.locator('a.episode-item')).toHaveCount(recorded)
  if (waiting) await expect(page.locator(`#episode-${waiting.id}`)).toContainText('준비 중')
  await expect(page.getByText(/읽기/)).toHaveCount(0)
  await page.getByRole('button', { name: '전체 회차 보기' }).click()
  await expect(page.locator('.episode-item:visible')).toHaveCount(26)
  await noOverflow(page)
  expect(errors).toEqual([])
})


test('큰 버튼은 플레이어를 열어 바로 재생하고, 낭독 문장을 앞뒤 문장과 함께 보여 준다', async ({ page }) => {
  await page.goto('./')
  await bigButton(page).click()
  await expect(page).toHaveURL(/\/audiobooks\/bae-byunghee\/prolog$/)
  await listening(page, 'prolog')
  await expect(pauseButton(page)).toBeVisible()
  const track = narration.prolog
  await expect(page.locator('.lyric-current')).toHaveText(track.texts[0])
  await jumpTo(page, track.cues[5][0] + 0.2)
  await expect(page.locator('.lyric-current')).toHaveText(track.texts[5])
  await expect(page.locator('.lyric-line').first()).toHaveText(track.texts[4])
  await expect(page.locator('.listen-art img')).toHaveAttribute('alt', /벼 한 줌/)
  await page.locator('.lyric-line').last().click()
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(track.cues[6][0] - 0.3)
  const title = await page.evaluate(() => navigator.mediaSession?.metadata?.title)
  expect(title).toBe('프롤로그 벼 한 톨의 무게')
})


test('10초 이동, 재생 위치, 속도와 타이머는 플레이어 안에서 바뀐다', async ({ page }) => {
  await startEpisode(page, 'prolog')
  await jumpTo(page, 60)
  await page.getByRole('button', { name: '10초 뒤로' }).click()
  await expect.poll(() => currentTime(page)).toBeLessThan(55)
  await page.getByRole('button', { name: '10초 앞으로' }).click()
  await expect.poll(() => currentTime(page)).toBeGreaterThan(58)
  await setRange(page, '재생 위치', 75)
  await expect.poll(() => currentTime(page)).toBeGreaterThan(74)
  const speed = page.getByRole('button', { name: /^재생 속도/ })
  await expect(speed).toHaveAccessibleName('재생 속도 1.0×')
  await speed.click()
  await expect(speed).toHaveAccessibleName('재생 속도 1.25×')
  await expect.poll(() => audio(page).evaluate((media: HTMLAudioElement) => media.playbackRate)).toBe(1.25)
  const timer = page.getByRole('button', { name: /^타이머/ })
  for (const label of ['15분', '30분', '회차 끝', '타이머']) {
    await timer.click()
    await expect(timer).toContainText(label)
  }
  await page.reload()
  await expect(page.getByRole('button', { name: /^재생 속도/ })).toHaveAccessibleName('재생 속도 1.25×')
})


test('멈춘 곳은 작품 홈 버튼과 회차에 남고, 이어 들으면 그 문장 처음부터 시작한다', async ({ page }) => {
  await startEpisode(page, 'prolog')
  await jumpTo(page, 43)
  await expect.poll(() => currentTime(page)).toBeGreaterThan(42)
  await pauseButton(page).click()
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('프롤로그 이어 듣기')
  await expect(page.locator('#episode-prolog')).toHaveAttribute('aria-current', 'true')
  await bigButton(page).click()
  await listening(page, 'prolog')
  const start = resumeStart(narration.prolog.cues, 43)
  await expect.poll(() => currentTime(page)).toBeGreaterThanOrEqual(start - 0.3)
  expect(await currentTime(page)).toBeLessThan(43)
})


test('회차가 끝나면 마지막 문장과 다음 화가 남고, 다음 화 녹음 전에는 같은 자리 버튼이 준비 중으로 잠긴다', async ({ page }) => {
  // The last recorded episode before the first waiting one; with every episode recorded, the book's last episode.
  const at = waiting ? readingOrder.indexOf(waiting) - 1 : readingOrder.length - 1
  test.skip(at < 0, '녹음된 회차가 없습니다')
  const { id } = readingOrder[at]
  await startEpisode(page, id)
  await jumpTo(page, narration[id].duration - 1.5)
  if (waiting) {
    await expect(nextButton(page)).toHaveText(`${waiting.label} 듣기 · 준비 중`, { timeout: 15000 })
    await expect(nextButton(page)).toBeDisabled()
    await expect(page.locator('.next-title')).toHaveText(nameOf(waiting))
  } else await expect(nextButton(page)).toHaveText('전체 회차 보기', { timeout: 15000 })
  await expect(page.locator('.lyric-current')).toHaveText(narration[id].texts.filter(Boolean).at(-1)!)
  await expect(page.locator('.transport')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:completed') || '[]'))).toContain(id)
})


test('다음 화 녹음이 있으면 회차 끝을 잠시 보여 준 뒤 다음 화 플레이어에서 이어 재생한다', async ({ page }) => {
  // This needs two episodes recorded in a row; the first such pair in reading order is used.
  const order = readingOrder
  const at = order.findIndex((entry, index) => index + 1 < order.length && narration[entry.id] && narration[order[index + 1].id])
  test.skip(at < 0, '이어서 녹음된 두 회차가 아직 없습니다')
  const [current, following] = [order[at], order[at + 1]]
  await startEpisode(page, current.id)
  await jumpTo(page, narration[current.id].duration - 1)
  await expect(nextButton(page)).toHaveText(`${following.label} 듣기`, { timeout: 15000 })
  await expect(nextButton(page)).toHaveClass(/is-counting/)
  await expect(page).toHaveURL(new RegExp(`/bae-byunghee/${following.id}$`), { timeout: 15000 })
  await listening(page, following.id)
})


test('녹음이 없는 회차는 같은 자리 버튼이 준비 중으로 잠기고 본문을 싣지 않는다', async ({ page }) => {
  test.skip(!waiting, '모든 회차가 녹음되었습니다')
  await page.goto(`${waiting!.id}`)
  await expect(page.getByRole('heading', { level: 1, name: waiting!.title })).toBeVisible()
  await expect(page.getByRole('button', { name: `${waiting!.label} 듣기 · 준비 중` })).toBeDisabled()
  await expect(page.locator('.story-content')).toHaveCount(0)
})


test('회차 목록은 녹음된 회차만 열고 나머지는 준비 중으로 둔다', async ({ page }) => {
  await page.goto('prolog')
  await page.getByRole('button', { name: '회차 목록' }).click()
  const sheet = page.getByRole('dialog', { name: '회차' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link')).toHaveCount(recorded)
  await expect(sheet.locator('[aria-current="page"]')).toHaveText('프롤로그 · 벼 한 톨의 무게')
  await expect(sheet.locator('.toc-wait')).toHaveCount(readingOrder.length - recorded)
  if (waiting) await expect(sheet.locator('.toc-wait', { hasText: nameOf(waiting) })).toContainText('준비 중')
  await sheet.getByRole('link', { name: '프롤로그 · 벼 한 톨의 무게' }).click()
  await expect(page).toHaveURL(/\/bae-byunghee\/prolog$/)
  await listening(page, 'prolog')
})


test('잠금 화면의 이전·다음 버튼은 10초 뒤로·앞으로 움직인다', async ({ page }) => {
  await page.addInitScript(() => {
    const handlers: Record<string, ((details: object) => void) | null> = {}
    Object.assign(window, { mediaHandlers: handlers })
    const original = navigator.mediaSession.setActionHandler.bind(navigator.mediaSession)
    navigator.mediaSession.setActionHandler = (name, handler) => {
      handlers[name] = handler as ((details: object) => void) | null
      try { original(name, handler) } catch { /* Unsupported actions keep the system default. */ }
    }
  })
  await startEpisode(page, 'prolog')
  await jumpTo(page, 60)
  await page.evaluate(() => (window as unknown as { mediaHandlers: Record<string, (details: object) => void> }).mediaHandlers.seekbackward({ action: 'seekbackward' }))
  await expect.poll(() => currentTime(page)).toBeLessThan(55)
  await page.evaluate(() => (window as unknown as { mediaHandlers: Record<string, (details: object) => void> }).mediaHandlers.seekforward({ action: 'seekforward' }))
  await expect.poll(() => currentTime(page)).toBeGreaterThan(58)
  expect(await page.evaluate(() => (window as unknown as { mediaHandlers: Record<string, unknown> }).mediaHandlers.nexttrack ?? null)).toBeNull()
})


test('플레이어 조작은 누르기 쉽고 화면을 넘지 않는다', async ({ page }) => {
  await startEpisode(page, 'prolog')
  await noOverflow(page)
  for (const control of await page.locator('.listen-bar a, .listen-bar button, .transport button, .transport a, .listen-tools button').all()) {
    const box = (await control.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
})


test('오디오북은 배경음악을 틀지 않는다', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/music/')) requests.push(request.url()) })
  await page.goto('./')
  await startEpisode(page, 'prolog')
  await expect(page.locator('.background-audio')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: '배경음악' })).toHaveCount(0)
  expect(requests).toEqual([])
})
