import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }

type Track = { src: string; duration: number; cues: (number | string)[][] }
const narration = (rawCatalog as unknown as { narration: Record<string, Track> }).narration
const cueStart = (id: string, index: number) => narration[id].cues[index][0] as number
const audio = (page: Page) => page.locator('.narration-audio')
const currentTime = (page: Page) => audio(page).evaluate((media: HTMLAudioElement) => media.currentTime)
const bar = (page: Page) => page.getByRole('region', { name: '오디오북 플레이어' })
const action = (page: Page) => bar(page).locator('.player-action')
const sheet = (page: Page) => page.getByRole('dialog', { name: '펼친 플레이어' })
const reading = (page: Page) => page.locator('.is-reading')

async function listening(page: Page, id: string) {
  await expect(audio(page)).toHaveAttribute('src', `/audiobooks/record/${id}.mp3`)
  await expect.poll(() => audio(page).evaluate((media: HTMLAudioElement) => !media.paused && media.readyState >= 2)).toBe(true)
}
async function jumpTo(page: Page, seconds: number) {
  await audio(page).evaluate((media: HTMLAudioElement, at: number) => { media.currentTime = at }, seconds)
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
// The one-time tip is checked once; other tests start from a listener who has already seen it.
function tipSeen(page: Page) {
  return page.addInitScript(() => localStorage.setItem('family-library:read-along-tip', '1'))
}
async function startEpisode(page: Page, id: string) {
  await page.goto(`read/${id}.html`)
  await action(page).click()
  await listening(page, id)
}
async function openSheet(page: Page) {
  await bar(page).locator('.player-expand').click()
  await expect(sheet(page)).toBeVisible()
}

test('회차 화면은 아래 막대 하나로 듣고, 재생 버튼은 같은 자리에서 글자만 바뀐다', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await tipSeen(page)
  await page.goto('read/ep01.html')
  await expect(bar(page)).toContainText('1화 어머니의 쇠갈고리')
  await expect(bar(page)).toContainText('4분')
  await expect(page.locator('.reader-toolbar a, .reader-toolbar button')).toHaveCount(2)
  await expect(page.locator('.narration-start, .narration-tool, .narration-dock')).toHaveCount(0)
  await expect(action(page)).toHaveText('듣기')
  const before = (await action(page).boundingBox())!
  await action(page).click()
  await listening(page, 'ep01')
  await expect(action(page)).toHaveText('일시 정지')
  const playing = (await action(page).boundingBox())!
  expect(Math.abs(playing.x - before.x)).toBeLessThan(1)
  expect(Math.abs(playing.width - before.width)).toBeLessThan(1)
  await expect(page.locator('.article-header h1 > span')).toHaveClass(/is-reading/)
  expect(await page.evaluate(() => navigator.mediaSession.metadata?.title)).toBe('1화 어머니의 쇠갈고리')
  await action(page).click()
  await expect(action(page)).toHaveText('이어 듣기')
  await expect.poll(() => audio(page).evaluate((media: HTMLAudioElement) => media.paused)).toBe(true)
  await noOverflow(page)
  await page.screenshot({ path: `test-results/reading/${info.project.name}-narration.png` })
  expect(errors).toEqual([])
})

test('처음 들을 때 한 번만 문장 표시와 문장 누르기를 알려 준다', async ({ page }) => {
  await startEpisode(page, 'ep01')
  const tip = page.getByRole('note')
  await expect(tip).toContainText('듣고 있는 문장')
  await tip.getByRole('button', { name: '알겠어요' }).click()
  await expect(tip).toHaveCount(0)
  await page.reload()
  await action(page).click()
  await listening(page, 'ep01')
  await expect(page.getByRole('note')).toHaveCount(0)
})

test('펼친 플레이어에서 문장을 옮기고 재생 속도와 다음 화 자동으로 듣기를 기억한다', async ({ page }) => {
  await tipSeen(page)
  await startEpisode(page, 'ep02')
  await openSheet(page)
  await sheet(page).getByRole('button', { name: '일시 정지' }).click()
  await sheet(page).getByRole('button', { name: '다음 문장' }).click()
  await expect(page.locator('.article-time > span')).toHaveClass(/is-reading/)
  await sheet(page).getByRole('button', { name: '다음 문장' }).click()
  await expect(page.locator('.story-content .cue[data-cue="2"]')).toHaveClass(/is-reading/)
  expect(Math.abs(await currentTime(page) - cueStart('ep02', 2))).toBeLessThan(0.3)
  await sheet(page).getByRole('button', { name: '이전 문장' }).click()
  await expect(page.locator('.article-time > span')).toHaveClass(/is-reading/)
  const faster = sheet(page).getByRole('button', { name: '1.25배 빠르게' })
  await faster.click()
  await expect(faster).toHaveAttribute('aria-pressed', 'true')
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.playbackRate)).toBe(1.25)
  await expect(sheet(page).getByText('타이머')).toHaveCount(0)
  const autoplay = sheet(page).getByRole('switch', { name: '다음 화 자동으로 듣기' })
  await autoplay.click()
  await expect(autoplay).toHaveAttribute('aria-checked', 'false')
  await sheet(page).getByRole('button', { name: '접기' }).click()
  await expect(sheet(page)).toBeHidden()
  await page.reload()
  await action(page).click()
  await listening(page, 'ep02')
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.playbackRate)).toBe(1.25)
  expect(await page.evaluate(() => localStorage.getItem('family-library:narration-autoplay'))).toBe('0')
})

test('멈춘 회차를 다시 열면 이어 듣기로 멈춘 문장부터 이어 간다', async ({ page }) => {
  await tipSeen(page)
  await startEpisode(page, 'ep01')
  await action(page).click()
  await openSheet(page)
  for (let step = 0; step < 3; step++) await sheet(page).getByRole('button', { name: '다음 문장' }).click()
  await sheet(page).getByRole('button', { name: '접기' }).click()
  await expect(page.locator('.story-content .cue[data-cue="3"]')).toHaveClass(/is-reading/)
  await page.reload()
  await expect(action(page)).toHaveText('이어 듣기')
  await expect(bar(page)).toContainText(/\d+:\d{2}부터 · \d+분 남음/)
  expect(await audio(page).evaluate((media: HTMLAudioElement) => media.paused)).toBe(true)
  await action(page).click()
  await listening(page, 'ep01')
  expect(Math.abs(await currentTime(page) - cueStart('ep01', 3))).toBeLessThan(1.5)
})

test('끝 음악에서 멈춘 회차는 다 들은 것으로 치고, 홈은 그다음 화를 권한다', async ({ page }) => {
  await tipSeen(page)
  await startEpisode(page, 'ep01')
  await audio(page).evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 9 })
  await expect(bar(page)).toContainText('초 후 다음 화')
  await action(page).click()
  await expect(action(page)).toHaveText('이어 듣기')
  await page.goto('./')
  await expect(bar(page)).toContainText('2화')
  await expect(action(page)).toHaveText('듣기')
  await expect(page.locator('#episode-ep01').getByRole('img', { name: '재생 완료' })).toBeVisible()
  await expect(page.locator('#episode-ep01')).not.toContainText('남음')
  await page.goto('read/ep01.html')
  await expect(action(page)).toHaveText('다시 듣기')
})

test('듣는 동안 다른 곳을 읽으면 따라가기를 멈추고, 누른 문장부터 다시 듣는다', async ({ page }, info) => {
  // Instant scrolling keeps the page still between the voice's moves and the reader's own.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await tipSeen(page)
  await startEpisode(page, 'ep01')
  await jumpTo(page, cueStart('ep01', 6) + 0.2)
  const sixth = page.locator('.story-content .cue[data-cue="6"]')
  await expect(sixth).toHaveClass(/is-reading/)
  await page.mouse.move(100, 300)
  await page.mouse.wheel(0, 1800)
  const back = page.getByRole('button', { name: '지금 듣는 곳으로', exact: true })
  await expect(back).toBeVisible()
  // The latest manuscript intentionally leaves rewritten recording cues unhighlighted.
  // Choose an exact surviving sentence after manual scrolling has paused following.
  const pickable = page.locator('.story-content .cue[data-cue="15"]').first()
  await pickable.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const target = await pickable.evaluate(element => {
    const line = element.getClientRects()[0]
    return { cue: Number(element.getAttribute('data-cue')), x: line.left + Math.min(20, line.width / 2), y: line.top + line.height / 2 }
  })
  await page.mouse.click(target.x, target.y)
  const offer = page.getByRole('button', { name: /^여기부터 듣기/ })
  await expect(offer).toBeVisible()
  await page.screenshot({ path: `test-results/reading/${info.project.name}-narration-pick.png` })
  await offer.click()
  await expect(page.locator(`.story-content .cue[data-cue="${target.cue}"]`).first()).toHaveClass(/is-reading/)
  expect(Math.abs(await currentTime(page) - cueStart('ep01', target.cue))).toBeLessThan(1)
  await expect(back).toHaveCount(0)
  await page.mouse.wheel(0, -2400)
  await expect(back).toBeVisible()
  await back.click()
  await expect(back).toHaveCount(0)
  await expect.poll(() => reading(page).first().evaluate(element => {
    const rect = element.getBoundingClientRect()
    return rect.top > 0 && rect.bottom < innerHeight
  })).toBe(true)
})

test('듣기 전에도 문장을 누르면 그 문장부터 들을 수 있다', async ({ page }) => {
  await tipSeen(page)
  await page.goto('read/ep01.html')
  const sentence = page.locator('.story-content .cue[data-cue="5"]').first()
  await sentence.scrollIntoViewIfNeeded()
  await sentence.click()
  await page.getByRole('button', { name: /^여기부터 듣기/ }).click()
  await listening(page, 'ep01')
  expect(Math.abs(await currentTime(page) - cueStart('ep01', 5))).toBeLessThan(1)
  await expect(page.locator('.story-content .cue[data-cue="5"]').first()).toHaveClass(/is-reading/)
})

test('회차 끝은 상자 없는 한 줄 이동이고, 다음 화를 누르면 넘어가자마자 그 회차를 들려 준다', async ({ page }) => {
  await tipSeen(page)
  await startEpisode(page, 'ep01')
  await jumpTo(page, (narration.ep01.cues.at(-1)![0] as number) + 0.5)
  await expect(bar(page)).toContainText(/\d+초 후 다음 화/)
  const navigation = page.getByRole('navigation', { name: '회차 이동' })
  await expect(navigation.getByRole('link', { name: '이전 화' })).toBeVisible()
  await expect(navigation.locator('.episode-position')).toHaveText('1화')
  expect(await navigation.locator('a').evaluateAll(links => links.map(link => getComputedStyle(link).backgroundColor)))
    .toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'])
  await expect(page.locator('.story-content .is-reading')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:completed') || '[]'))).toContain('ep01')
  await navigation.getByRole('link', { name: '다음 화' }).click()
  await expect(page).toHaveURL(/read\/ep02\.html$/)
  await listening(page, 'ep02')
  await expect(page.locator('.article-header h1 > span')).toHaveClass(/is-reading/)
})

test('음악이 끝나면 저절로 다음 화로 넘어가고, 들을 수 없는 회차 앞에서 멈춘다', async ({ page }) => {
  test.setTimeout(60000)
  await tipSeen(page)
  await startEpisode(page, 'ep02')
  await audio(page).evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 1.5 })
  await expect(page).toHaveURL(/read\/ep03\.html$/, { timeout: 15000 })
  await listening(page, 'ep03')
  await audio(page).evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 1.5 })
  await expect(action(page)).toHaveText('다시 듣기', { timeout: 15000 })
  await expect(bar(page)).toContainText('재생 완료')
  // A finished episode lets go of its recording, so nothing can restart it unseen.
  await expect.poll(() => audio(page).getAttribute('src'), { timeout: 15000 }).toBeNull()
  await expect(page).toHaveURL(/read\/ep03\.html$/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:completed') || '[]'))).toEqual(expect.arrayContaining(['ep02', 'ep03']))
})

test('목차에서 회차를 누르면 바로 듣고, 목차로 돌아가도 계속 들린다', async ({ page }) => {
  await tipSeen(page)
  await page.goto('./')
  const row = page.locator('#episode-ep01')
  await expect(row).toContainText('4분')
  await row.click()
  await expect(page).toHaveURL(/read\/ep01\.html$/)
  await listening(page, 'ep01')
  const back = (await page.locator('.back-link').boundingBox())!
  await page.mouse.click(back.x + back.width / 2, back.y + back.height / 2)
  await expect(page.locator('.chapter-list')).toBeVisible()
  await listening(page, 'ep01')
  await expect(page.locator('#episode-ep01')).toContainText('재생 중')
  await expect(action(page)).toHaveText('일시 정지')
  await expect(bar(page)).toContainText('1화 어머니의 쇠갈고리')
})

test('목차의 회차를 새 탭으로 열면 지금 화면에서는 소리를 내지 않는다', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'desktop', '새 탭 열기는 마우스로 쓰는 화면에서 확인한다')
  await tipSeen(page)
  await page.goto('./')
  const opened = context.waitForEvent('page')
  await page.locator('#episode-ep01').click({ modifiers: ['ControlOrMeta'] })
  await (await opened).close()
  await expect(page.locator('.chapter-list')).toBeVisible()
  expect(await audio(page).getAttribute('src')).toBeNull()
  await expect(action(page)).toHaveText('듣기')
})

test('홈은 이어 들을 회차를 아래 막대에 두고, 목차에 남은 시간·재생 완료·준비 중을 표시한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('family-library:narration', JSON.stringify({ id: 'ep01', time: 82 }))
    localStorage.setItem('family-library:completed', JSON.stringify(['prolog']))
  })
  await page.goto('./')
  await expect(page.locator('.resume-link')).toHaveCount(0)
  await expect(page.getByText('이어서 읽기')).toHaveCount(0)
  await expect(page.locator('.home-subtitle')).toHaveText('오디오북 · 배병희 자전소설')
  await expect(page.locator('.home-meta')).toHaveText('26편 · 지금 4편 들을 수 있어요')
  await expect(bar(page)).toContainText('1화 어머니의 쇠갈고리')
  await expect(bar(page)).toContainText('1:22부터 · 3분 남음')
  await expect(action(page)).toHaveText('이어 듣기')
  await expect(page.locator('#episode-ep01')).toContainText('3분 남음')
  await expect(page.locator('#episode-prolog').getByRole('img', { name: '재생 완료' })).toBeVisible()
  await expect(page.locator('#episode-ep04')).toContainText('준비 중')
  await action(page).click()
  await expect(page).toHaveURL(/read\/ep01\.html$/)
  await listening(page, 'ep01')
  expect(await currentTime(page)).toBeGreaterThan(60)
})

test('홈의 펼친 플레이어에서 이어 듣기를 누르면 플레이어를 접고 그 회차 글을 보여 준다', async ({ page }) => {
  await tipSeen(page)
  await page.addInitScript(() => localStorage.setItem('family-library:narration', JSON.stringify({ id: 'ep01', time: 82 })))
  await page.goto('./')
  await openSheet(page)
  await sheet(page).getByRole('button', { name: '이어 듣기' }).click()
  await expect(page).toHaveURL(/read\/ep01\.html$/)
  await listening(page, 'ep01')
  await expect(sheet(page)).toBeHidden()
})

test('공유를 누르면 이 회차 주소를 휴대폰 공유 창으로 보낸다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => { (window as unknown as { shared: ShareData }).shared = data; return Promise.resolve() },
    })
  })
  await page.goto('read/ep01.html')
  await openSheet(page)
  await sheet(page).getByRole('button', { name: '공유' }).click()
  const shared = await page.evaluate(() => (window as unknown as { shared: ShareData }).shared)
  expect(shared.url).toMatch(/\/audiobooks\/read\/ep01\.html$/)
  expect(shared.title).toContain('1화 어머니의 쇠갈고리')
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
  await tipSeen(page)
  await startEpisode(page, 'ep01')
  await jumpTo(page, 60)
  await page.evaluate(() => (window as unknown as { mediaHandlers: Record<string, (details: object) => void> }).mediaHandlers.seekbackward({ action: 'seekbackward' }))
  await expect.poll(() => currentTime(page)).toBeLessThan(55)
  await page.evaluate(() => (window as unknown as { mediaHandlers: Record<string, (details: object) => void> }).mediaHandlers.seekforward({ action: 'seekforward' }))
  await expect.poll(() => currentTime(page)).toBeGreaterThan(58)
  expect(await page.evaluate(() => (window as unknown as { mediaHandlers: Record<string, unknown> }).mediaHandlers.nexttrack ?? null)).toBeNull()
})

test('녹음이 없는 회차는 막대에 준비 중만 보이고 글은 그대로 읽는다', async ({ page }) => {
  await page.goto('read/ep04.html')
  await expect(bar(page)).toContainText('4화 천수만의 돌풍')
  await expect(action(page)).toHaveText('준비 중')
  await expect(action(page)).toBeDisabled()
  await expect(page.locator('.story-content p').first()).toBeVisible()
  await expect(page.locator('.reader-toolbar a, .reader-toolbar button')).toHaveCount(2)
})

test('회차 첫 그림을 받지 못하면 막대는 작은 그림을 따로 받고, 다시 불러온 그림을 이어 쓴다', async ({ page }) => {
  const painting = (url: URL) => url.pathname.includes('/images/episodes/ep01-01-') && !url.pathname.endsWith('-360.jpg')
  await page.route(painting, route => route.abort())
  await page.goto('read/ep01.html')
  const figure = page.locator('[data-illustration="ep01-01"]')
  const thumb = bar(page).locator('img.player-thumb')
  await expect(figure.locator('.image-error')).toBeVisible()
  await expect(thumb).toHaveAttribute('src', /\/audiobooks\/images\/episodes\/ep01-01-360\.jpg$/)
  await page.unroute(painting)
  await figure.getByRole('button', { name: '그림 다시 불러오기' }).click()
  await expect.poll(() => figure.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await expect(thumb).toHaveAttribute('src', await figure.locator('img').evaluate((img: HTMLImageElement) => img.currentSrc))
})

test('배경음악은 틀지 않는다', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (request.url().includes('/music/')) requests.push(request.url()) })
  await page.goto('./')
  await expect(page.locator('.chapter-row')).toHaveCount(26)
  await page.goto('read/ep01.html')
  await page.locator('body').click()
  await expect(page.locator('.background-audio')).toHaveCount(0)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('switch', { name: '배경음악' })).toHaveCount(0)
  expect(requests).toEqual([])
})

test('아주 큰 글씨에서도 막대와 펼친 플레이어가 화면을 넘지 않고 누르기 쉽다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-library:font', '3'))
  await tipSeen(page)
  await startEpisode(page, 'ep01')
  await noOverflow(page)
  for (const control of await bar(page).locator('.player-row button').all()) {
    const box = (await control.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
  }
  await openSheet(page)
  await noOverflow(page)
  for (const control of await sheet(page).locator('button').all()) {
    const box = (await control.boundingBox())!
    if (!box) continue
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})
