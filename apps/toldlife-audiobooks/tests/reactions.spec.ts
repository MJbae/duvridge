import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { migrateReactionIds } from '../scripts/migrate-reaction-ids.mjs'

const PROJECT = 'demo-family-library'
const FIRESTORE = 'http://127.0.0.1:8080'
const AUTH = 'http://127.0.0.1:9099'
const documentsBase = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`

function mobileFamilyContext(browser: Browser) {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'ko-KR',
    reducedMotion: 'reduce',
    baseURL: 'http://127.0.0.1:4175',
  })
}

test.beforeEach(async ({ request }) => {
  // These are explicitly local demo data only. This suite never uses a real
  // Firebase project or credentials, even when a developer has .env.local.
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8080')
  expect(process.env.FIREBASE_AUTH_EMULATOR_HOST).toBe('127.0.0.1:9099')
  const clearDocuments = await request.delete(
    `${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`
  )
  expect(clearDocuments.ok()).toBeTruthy()
  const clearAccounts = await request.delete(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`)
  expect(clearAccounts.ok()).toBeTruthy()
})

async function openReactions(page: Page, id = 'ep01') {
  // Reactions belong to the end of an episode: play it out, and stay there instead of moving on.
  await page.addInitScript(() => localStorage.setItem('family-library:narration-autoplay', '0'))
  await page.goto(`/read/${id}.html`)
  // The dev server may reload a page once while it prepares dependencies; then the episode plays out again.
  await expect(async () => {
    if (await page.locator('.listen-end').isVisible()) return
    await page.getByRole('button', { name: '재생', exact: true }).click({ timeout: 2000 })
    await expect.poll(() => page.locator('.narration-audio').evaluate((media: HTMLAudioElement) => !media.paused && media.readyState >= 2), { timeout: 5000 }).toBe(true)
    await page.locator('.narration-audio').evaluate((media: HTMLAudioElement) => { media.currentTime = media.duration - 1 })
    await expect(page.locator('.listen-end')).toBeVisible({ timeout: 8000 })
  }).toPass({ timeout: 60000 })
  // A reaction already left shows its count in the button's name, so the first button is found by place.
  await expect(page.locator('.reaction-options button').first()).toBeEnabled()
  await expect(page.locator('.reaction-options button')).toHaveCount(4)
  await expect(page.getByRole('button', { name: '기억나요', exact: true })).toHaveCount(0)
  await expect(page.locator('.reaction-error')).toHaveCount(0)
  await expect(page.locator('.reaction-status')).toHaveCount(0)
  // Line icons match the rest of the interface; emoji vary by device.
  await expect(page.locator('.reaction-options button svg')).toHaveCount(4)
  expect(await page.locator('.reaction-options').innerText()).not.toMatch(/\p{Extended_Pictographic}/u)
  await expect(page.getByRole('group', { name: '마음 남기기' })).toBeVisible()
  // The reactions and the next episode keep the 40px gap of every episode end.
  expect(await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return Math.round(box('.next-episode').top - box('.reaction-options').bottom)
  })).toBe(40)
}
async function storedReactions(request: APIRequestContext) {
  const response = await request.get(`${documentsBase}/pages/memoir-ep01/reactions`, { headers: { Authorization: 'Bearer owner' } })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).documents || []
}

test('Firebase가 연결되어도 댓글 화면과 요청은 없고 회차 반응은 유지한다', async ({ page }) => {
  const commentRequests: string[] = []
  page.on('request', request => {
    if (/\/comments(?:\/|\?|$)/.test(request.url())) commentRequests.push(request.url())
  })
  await page.goto('/')
  await expect(page.getByRole('link', { name: '한 번에 읽기', exact: true })).toHaveCount(0)
  await openReactions(page)
  await page.locator('.listen-end').screenshot({ path: 'test-results/reactions/reactions-390.png' })
  await expect(page.locator('#comments, .family-comments, .comment-composer')).toHaveCount(0)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.locator('.next-episode .big-button').click()
  await expect(page).toHaveURL(/ep02\.html$/)
  await openReactions(page, 'ep02')
  await expect(page.getByRole('button', { name: '좋아요', exact: true })).toBeEnabled()
  await expect(page.locator('#comments, .family-comments, .comment-composer')).toHaveCount(0)
  expect(commentRequests).toEqual([])
})

test('episode reactions coalesce clicks, persist across browsers, switch, cancel, and survive next-episode navigation', async ({ page, request, browser }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await openReactions(page)
  expect(await storedReactions(request)).toHaveLength(0)
  const optionsBefore = await page.locator('.reaction-options').boundingBox()
  await page.getByRole('button', { name: '응원해요', exact: true }).click()
  await page.getByRole('button', { name: '좋아요', exact: true }).click()
  await expect.poll(async () => (await storedReactions(request))[0]?.fields.like.integerValue).toBe('1')
  expect((await storedReactions(request))[0].fields.heart.integerValue).toBe('0')
  expect((await page.locator('.reaction-options').boundingBox())!.height).toBe(optionsBefore!.height)
  const context = await mobileFamilyContext(browser)
  try {
    const other = await context.newPage()
    await openReactions(other)
    await expect(other.getByRole('button', { name: '좋아요 1', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await openReactions(page)
    await expect(page.getByRole('button', { name: '좋아요 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '좋아요 1', exact: true }).click()
    await expect.poll(async () => (await storedReactions(request))[0]?.fields.like.integerValue).toBe('0')
    // An old selection remains valid data but must not surface as a fifth option.
    const stored = (await storedReactions(request))[0]
    const seeded = await request.patch(`${FIRESTORE}/v1/${stored.name}`, {
      headers: { Authorization: 'Bearer owner' },
      data: { fields: { heart: { integerValue: '0' }, like: { integerValue: '0' }, moved: { integerValue: '0' }, wow: { integerValue: '0' }, remember: { integerValue: '1' }, updatedAt: { timestampValue: new Date(Date.now() - 2000).toISOString() } } },
    })
    expect(seeded.ok()).toBeTruthy()
    await openReactions(page)
    await expect(page.locator('.reaction-options button[aria-pressed="true"]')).toHaveCount(0)
    await expect(page.locator('.remember-hint')).toHaveCount(0)
    await page.getByRole('button', { name: '대단해요', exact: true }).click()
    // A chosen reaction fills its icon, so the state does not rely on color alone.
    await expect(page.locator('.reaction-options button[aria-pressed="true"] svg')).toHaveAttribute('fill', 'currentColor')
    await expect(page.locator('.reaction-options button[aria-pressed="false"] svg[fill="currentColor"]')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: 'test-results/reactions/reactions-320.png', fullPage: true })
    await page.locator('.next-episode .big-button').click()
    await expect(page).toHaveURL(/ep02\.html$/)
    await expect.poll(async () => (await storedReactions(request))[0]?.fields.wow.integerValue).toBe('1')
    expect((await storedReactions(request))[0].fields.remember.integerValue).toBe('0')
  } finally { await context.close() }
})

test('초기 서버 연결이 늦어도 반응을 즉시 선택하고 늦은 조회가 선택을 덮어쓰지 않는다', async ({ page, request }) => {
  let release!: () => void, requested = false
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route(/\/firestore-reaction-store\.ts(?:\?|$)/, async route => {
    requested = true
    await pending
    await route.continue()
  })
  try {
    await openReactions(page)
    await expect.poll(() => requested).toBe(true)
    const heart = page.locator('.reaction-options button').nth(0)
    const like = page.locator('.reaction-options button').nth(1)
    await heart.click()
    await expect(heart).toHaveAttribute('aria-pressed', 'true', { timeout: 250 })
    await like.click()
    await expect(like).toHaveAttribute('aria-pressed', 'true', { timeout: 250 })
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.reaction-bar')).not.toContainText(/저장 중|반응을 불러오는 중|반응을 남겼어요/)
    expect(await storedReactions(request)).toHaveLength(0)
    release()
    await expect.poll(async () => (await storedReactions(request))[0]?.fields.like.integerValue).toBe('1')
    await expect(like).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.reaction-error')).toHaveCount(0)
  } finally { release() }
})

test('저장 요청 중에도 선택을 바꾸고 마지막 선택만 순서대로 저장한다', async ({ page, request }) => {
  let release!: () => void, blocked = false
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route(/\/Write\/channel/, async route => {
    blocked = true
    await pending
    await route.continue()
  })
  try {
    await openReactions(page)
    const heart = page.locator('.reaction-options button').nth(0)
    const like = page.locator('.reaction-options button').nth(1)
    await heart.click()
    await expect.poll(() => blocked).toBe(true)
    expect(await storedReactions(request)).toHaveLength(0)
    await like.click()
    await expect(like).toHaveAttribute('aria-pressed', 'true', { timeout: 250 })
    await expect(heart).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.reaction-status')).toHaveCount(0)
    release()
    await expect.poll(async () => (await storedReactions(request))[0]?.fields.like.integerValue).toBe('1')
    expect((await storedReactions(request))[0].fields.heart.integerValue).toBe('0')
    await expect(like).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.reaction-error')).toHaveCount(0)
  } finally { release() }
})

test('미전송 선택을 보관하고 다른 화에서 새로고침해도 이어서 저장한다', async ({ page, request }) => {
  await page.route(/\/firestore-reaction-store\.ts(?:\?|$)/, async route => {
    await new Promise(resolve => setTimeout(resolve, 1800))
    await route.continue().catch(() => { /* The old document's request is cancelled on navigation. */ })
  })
  await openReactions(page)
  await page.locator('.reaction-options button').first().click()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:reaction:ep01')!)))
    .toMatchObject({ selected: 'heart', pending: true })
  await page.locator('.next-episode .big-button').click()
  await expect(page).toHaveURL(/ep02\.html$/)
  await page.reload()
  await openReactions(page, 'ep02')
  await expect(page.locator('.reaction-options button')).toHaveCount(4)
  await expect(page.locator('.reaction-options button[aria-pressed="true"]')).toHaveCount(0)
  await expect.poll(async () => (await storedReactions(request))[0]?.fields.heart.integerValue).toBe('1')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family-library:reaction:ep01')!).pending)).toBe(false)
  await openReactions(page)
  await expect(page.locator('.reaction-options button').first()).toHaveAttribute('aria-pressed', 'true')
})

test('기존 반응을 UID·선택·시각 그대로 이관하고 재실행해도 최신 선택과 취소를 보존한다', async ({ page, request }) => {
  await openReactions(page)
  await page.getByRole('button', { name: '응원해요', exact: true }).click()
  await expect.poll(async () => (await storedReactions(request)).length).toBe(1)
  const own = (await storedReactions(request))[0]
  const uid = own.name.split('/').at(-1)
  expect((await request.delete(`${FIRESTORE}/v1/${own.name}`, { headers: { Authorization: 'Bearer owner' } })).ok()).toBeTruthy()
  const older = new Date(Date.now() - 5000).toISOString()
  const newer = new Date(Date.now() - 2000).toISOString()
  const fields = (selected: string, time: string) => ({
    ...Object.fromEntries(['heart', 'like', 'moved', 'wow', 'remember'].map(key => [key, { integerValue: key === selected ? '1' : '0' }])),
    updatedAt: { timestampValue: time },
  })
  for (const [id, user, selected, time] of [
    ['memoir-ep-josae', uid!, 'like', older],
    ['memoir-ep-josae', 'other-reader', 'heart', older],
    ['memoir-ep01', 'other-reader', 'wow', newer],
  ]) {
    const response = await request.patch(`${documentsBase}/pages/${id}/reactions/${user}`, { headers: { Authorization: 'Bearer owner' }, data: { fields: fields(selected, time) } })
    expect(response.ok()).toBeTruthy()
  }
  const options = { project: PROJECT, emulator: true }
  expect(await migrateReactionIds(options)).toMatchObject({ sourceDocuments: 2, plannedWrites: 1, copied: 0, alreadyCurrent: 1 })
  expect(await storedReactions(request)).toHaveLength(1)
  expect(await migrateReactionIds({ ...options, apply: true })).toMatchObject({ copied: 1, alreadyCurrent: 1 })
  expect(await migrateReactionIds({ ...options, apply: true })).toMatchObject({ plannedWrites: 0, copied: 0, alreadyCurrent: 2 })
  const migrated = (await storedReactions(request)).find((doc: { name: string }) => doc.name.endsWith(`/${uid}`))
  expect(migrated.fields).toMatchObject(fields('like', older))
  await openReactions(page)
  await expect(page.getByRole('button', { name: '좋아요 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '대단해요 1', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: '좋아요 1', exact: true }).click()
  await expect.poll(async () => (await storedReactions(request)).find((doc: { name: string }) => doc.name.endsWith(`/${uid}`))?.fields.like.integerValue).toBe('0')
  expect(await migrateReactionIds({ ...options, apply: true })).toMatchObject({ copied: 0, alreadyCurrent: 2 })
})
