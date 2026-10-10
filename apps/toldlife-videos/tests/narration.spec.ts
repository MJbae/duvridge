import { expect, test, type Page } from '@playwright/test'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }
import { cueIndexAt, type NarrationCue } from '../site/.vitepress/shared/narration-cues.mjs'

const allowedAutoplayTest = test.extend({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } })
// Trace snapshots can activate the page before the autoplay assertion.
const gestureRequiredTest = test.extend({ launchOptions: { args: ['--autoplay-policy=user-gesture-required'] }, trace: 'off' })

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
  await expect.poll(() => player(page).evaluate((media: HTMLVideoElement) => !media.paused && !media.muted && media.readyState >= 2)).toBe(true)
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
async function showControls(page: Page) {
  const toggle = page.locator('.stage-frame')
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
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
  const episode = Object.entries(video).find(([, track]) => track.scenes.length > 1)
  expect(episode, '장면 이동을 검사할 회차에는 장면이 둘 이상 있어야 합니다').toBeDefined()
  const [id, track] = episode!
  await page.goto(id)
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await playButton(page).click()
  await watching(page, id)
  const disclosure = page.getByRole('button', { name: `장면 보기 · ${track.scenes.length}개`, exact: true })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('.scene-grid')).toBeHidden()
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  const scenes = page.locator('.scene-card')
  await expect(scenes).toHaveCount(track.scenes.length)
  await scenes.nth(1).click()
  const second = track.cues[track.scenes[1][0]][0]
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
  await page.locator('.film-bar').getByRole('link', { name: '작품 홈으로' }).click()
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

const films = (rawCatalog as unknown as { films: { id: string; title: string; src: string; poster: { src: string }; width: number; height: number }[] }).films

test('원작으로 만든 영상은 공통 조작부로 재생되고, 오리지널 시리즈 작품 전체로 이어진다', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  expect(films.map(film => film.id)).toEqual(['nureon-bongtu', 'byeotgap', 'mot-bon-cheok'])
  for (const film of films) {
    await page.goto(film.id)
    await expect(page.getByRole('heading', { level: 1, name: film.title, exact: true })).toBeVisible()
    const media = page.locator('video.film-video')
    await expect(media).toHaveAttribute('src', `/videos${film.src}`)
    await expect(media).toHaveAttribute('poster', `/videos${film.poster.src}`)
    expect(await media.evaluate((element: HTMLVideoElement) => !element.controls && element.playsInline)).toBe(true)
    // A tall film keeps its shape and leaves room below it.
    if (film.height > film.width) expect(await media.evaluate(element => element.getBoundingClientRect().height / innerHeight)).toBeLessThanOrEqual(0.73)
    await expect(page.getByRole('link', { name: '영상 홈으로' })).toHaveAttribute('href', '/#videos')
    await expect(page.getByRole('heading', { name: '오리지널 시리즈', exact: true })).toBeVisible()
    const origin = page.locator('.film-origin-card')
    await expect(origin).toHaveText(new RegExp('내 논을 파는 한이 있어도'))
    await expect(origin).toHaveAttribute('href', `/novels/bae-byunghee/?from=${film.id}`)
    // A film links only to its whole original: no episode, novel or audiobook buttons.
    await expect(page.locator('.film-page .big-button, .film-page .format-switch')).toHaveCount(0)
    await noOverflow(page)
  }
  expect(errors).toEqual([])
})

test('단일 영상과 시리즈 회차는 같은 10초 이동, 재생 위치와 전체 화면 조작부를 쓴다', async ({ page }) => {
  for (const id of ['prolog', 'nureon-bongtu']) {
    await page.goto(id)
    await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
    const media = page.locator(id === 'prolog' ? 'video.stage-video' : 'video.film-video')
    if (await media.evaluate((element: HTMLVideoElement) => element.paused)) await playButton(page).click()
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => !element.paused && !element.muted && element.readyState >= 2)).toBe(true)
    await showControls(page)
    await pauseButton(page).click()
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
    const seek = page.getByRole('slider', { name: '재생 위치', exact: true })
    const target = await media.evaluate((element: HTMLVideoElement) => Math.min(30, element.duration / 3))
    await seek.evaluate((element: HTMLInputElement, time) => {
      element.value = String(time)
      element.dispatchEvent(new Event('input', { bubbles: true }))
    }, target)
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(target, 1)
    await page.getByRole('button', { name: '10초 앞으로', exact: true }).click()
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(target + 10, 1)
    await page.getByRole('button', { name: '10초 뒤로', exact: true }).click()
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeCloseTo(target, 1)
    await page.getByRole('button', { name: '전체 화면', exact: true }).click()
    const screen = page.locator(id === 'prolog' ? '.theater-page' : '.film-page')
    await expect(screen).toHaveClass(/is-full/)
    await page.getByRole('button', { name: '전체 화면 끝내기', exact: true }).click()
    await expect(screen).not.toHaveClass(/is-full/)
    await expect(page.getByRole('button', { name: '재생', exact: true })).toBeVisible()
  }
})

test('시리즈 첫 회차는 다음 화 카드, 이전 화 없음, 전체 회차와 오리지널 시리즈를 보여 준다', async ({ page }) => {
  await page.goto('prolog')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  const next = page.locator('.theater-next-card')
  await expect(next).toHaveAttribute('href', '/videos/bae-byunghee/ep01')
  await expect(next.locator('.episode-label')).toHaveText('1화')
  await expect(next.locator('.episode-title')).not.toBeEmpty()
  const navigation = page.locator('.theater-episode-links')
  await expect(navigation.getByRole('button', { name: '이전 화 없음', exact: true })).toBeDisabled()
  await expect(navigation.getByRole('link', { name: /전체 회차/ })).toHaveAttribute('href', '/videos/bae-byunghee/#episode-prolog')
  await expect(page.getByRole('heading', { name: '오리지널 시리즈', exact: true })).toBeVisible()
  await expect(page.locator('.film-origin-card')).toHaveAttribute('href', '/novels/bae-byunghee/')
  await expect(page.locator('.film-origin-card')).toContainText('내 논을 파는 한이 있어도')
})

test('끝난 뒤 자동 다음 화를 취소할 수 있고 다음 회차도 같은 영상 요소로 재생한다', async ({ page }) => {
  await page.clock.install()
  await page.goto('prolog')
  await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
  await playButton(page).click()
  await watching(page, 'prolog')
  const original = await player(page).elementHandle()
  await player(page).evaluate((media: HTMLVideoElement) => { media.pause(); media.dispatchEvent(new Event('ended')) })
  await expect(page.locator('.theater-end .episode-nav .big-button')).toHaveClass(/is-counting/)
  await page.getByRole('button', { name: '자동 다음 화 취소', exact: true }).click()
  await expect(page.locator('.theater-end .episode-nav .big-button')).not.toHaveClass(/is-counting/)
  await page.clock.fastForward(6000)
  await expect(page).toHaveURL(/\/prolog$/)
  await page.locator('.theater-next-card').click()
  await expect(page).toHaveURL(/\/ep01$/)
  await watching(page, 'ep01')
  expect(await player(page).evaluate((media, first) => media === first, original)).toBe(true)
  await player(page).evaluate((media: HTMLVideoElement) => { media.pause(); media.dispatchEvent(new Event('ended')) })
  await expect(page.locator('.theater-end .episode-nav .big-button')).toHaveClass(/is-counting/)
  await page.clock.fastForward(5000)
  await expect(page).toHaveURL(/\/ep02$/)
  await watching(page, 'ep02')
  expect(await player(page).evaluate((media, first) => media === first, original)).toBe(true)
})

allowedAutoplayTest('영상 화면을 열면 음소거 해제 상태로 바로 재생된다', async ({ page }) => {
  for (const film of films) {
    await page.goto(film.id)
    const media = page.locator('video.film-video')
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => !element.paused && !element.muted && element.volume > 0 && element.currentTime > 0), { timeout: 15000 }).toBe(true)
    await expect(page.getByRole('button', { name: '소리 켜기' })).toHaveCount(0)
  }
})

test('브라우저가 소리를 막아도 음소거로 재시도하지 않고 재생 버튼을 기다린다', async ({ page }) => {
  // Muted playback would be allowed here, but the app must keep sound enabled.
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    let tapped = false
    const attempts: boolean[] = []
    Object.defineProperty(window, 'filmPlayAttempts', { get: () => attempts })
    addEventListener('pointerdown', () => { tapped = true }, true)
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      attempts.push(this.muted)
      return !this.muted && !tapped ? Promise.reject(new DOMException('소리는 누른 뒤에만', 'NotAllowedError')) : play.call(this)
    }
  })
  await page.goto('byeotgap')
  const media = page.locator('video.film-video')
  await expect.poll(() => page.evaluate(() => Reflect.get(window, 'filmPlayAttempts'))).toEqual([false])
  expect(await media.evaluate((element: HTMLVideoElement) => element.paused && !element.muted && element.currentTime === 0)).toBe(true)
  await expect(page.getByRole('button', { name: '소리 켜기' })).toHaveCount(0)
  await playButton(page).click()
  await expect.poll(() => media.evaluate((element: HTMLVideoElement) => !element.muted && !element.paused)).toBe(true)
  expect(await page.evaluate(() => Reflect.get(window, 'filmPlayAttempts'))).toEqual([false, false])
})

// Each page gets a fresh browser context so an earlier playback click cannot authorize autoplay.
for (const [id, kind] of [['prolog', '시리즈 회차'], ['byeotgap', '단일 영상']]) {
  gestureRequiredTest(`${kind} 페이지는 음소거 해제 상태로 열리고 재생 한 번으로 소리가 난다`, async ({ page }) => {
    const session = await page.context().newCDPSession(page)
    await page.goto(id)
    // Playwright DOM evaluations can count as user gestures; read the initial state without one.
    await expect.poll(async () => {
      const { result } = await session.send('Runtime.evaluate', {
        expression: `(() => {
          const media = document.querySelector('video');
          return document.querySelector('[data-reader-ready="true"]') && media
            ? { paused: media.paused, muted: media.muted, defaultMuted: media.defaultMuted,
                volume: media.volume, time: media.currentTime, activated: navigator.userActivation.hasBeenActive }
            : null;
        })()`,
        userGesture: false,
        returnByValue: true,
      })
      return result.value
    }).toEqual({ paused: true, muted: false, defaultMuted: false, volume: 1, time: 0, activated: false })
    const media = page.locator('video')
    await expect(page.getByRole('button', { name: '소리 켜기' })).toHaveCount(0)
    await playButton(page).click()
    await expect.poll(() => media.evaluate((element: HTMLVideoElement) => !element.paused && !element.muted && element.currentTime > 0)).toBe(true)
  })
}
