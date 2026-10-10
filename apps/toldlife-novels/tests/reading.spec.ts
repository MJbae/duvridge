import { expect, test, type Page } from '@playwright/test'
import { legacyEpisodes } from '../site/.vitepress/shared/episode-heading.mjs'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }
import illustrationManifest from '../../../content/books/bae-byunghee/illustrations/manifest.json' with { type: 'json' }
import type { Illustration } from '@duvridge/content-processing/types'
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }
const bigButton = (page: Page) => page.locator('.work-action .big-button')
const quiet = (page: Page) => page.addInitScript(() => localStorage.setItem('family-library:music', JSON.stringify({ enabled: false })))
const fontSize = (page: Page) => page.locator('.story-content p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))
// How far a row sits from the middle of the screen.
const offCenter = (page: Page, selector: string) => page.locator(selector).evaluate(element => {
  const box = element.getBoundingClientRect()
  return Math.abs(box.top + box.height / 2 - innerHeight / 2)
})

test('작품 홈은 키아트·제목·소설 | 오디오북 전환·큰 버튼 하나와 소설 회차 목록만 보여 준다', async ({ page }) => {
  await quiet(page)
  await page.goto('./')
  await expect(page).toHaveTitle(rawCatalog.work.title)
  await expect(page.getByRole('heading', { level: 1, name: rawCatalog.work.title })).toBeVisible()
  await expect(bigButton(page)).toHaveText('처음부터 읽기')
  await expect(bigButton(page)).toHaveAccessibleName('처음부터 읽기')
  await expect(bigButton(page)).toHaveAttribute('href', '/novels/bae-byunghee/prolog')
  // Both formats share the same width and the selected format keeps its address.
  const formats = page.getByRole('navigation', { name: '형식' }).getByRole('link')
  await expect(formats).toHaveText(['소설', '오디오북'])
  await expect(formats.first()).toHaveAttribute('aria-current', 'page')
  await expect(formats.last()).toHaveAttribute('href', '/audiobooks/bae-byunghee/')
  const [novel, audio] = await formats.evaluateAll(links => links.map(link => link.getBoundingClientRect().width))
  expect(Math.abs(novel - audio)).toBeLessThan(1)
  await expect(formats.locator('svg')).toHaveCount(0)
  const switchBox = (await page.locator('.format-switch').boundingBox())!
  const buttonBox = (await bigButton(page).boundingBox())!
  expect((await formats.first().boundingBox())!.height).toBe(48)
  expect(switchBox.height).toBe(49)
  expect(buttonBox.height).toBe(56)
  expect(Math.abs(buttonBox.y - switchBox.y - switchBox.height - 16)).toBeLessThan(1)
  await expect(bigButton(page).locator('svg')).toHaveCount(1)
  await expect(page.locator('.work-action')).toHaveText('처음부터 읽기')
  if (page.viewportSize()!.width >= 900) {
    expect(switchBox.width).toBe(360)
    expect(buttonBox.width).toBe(360)
  } else {
    const artBox = (await page.locator('.work-art').boundingBox())!
    const titleBox = (await page.locator('#work-title').boundingBox())!
    expect(artBox.height).toBe(304)
    expect(Math.abs(switchBox.y - artBox.y - artBox.height - 20)).toBeLessThan(1)
    expect(Math.abs(artBox.y + artBox.height - titleBox.y - titleBox.height - 28)).toBeLessThan(1)
    expect(titleBox.x).toBeGreaterThanOrEqual(20)
    expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(page.viewportSize()!.width - 20)
    expect(await page.locator('#work-title').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(32)
  }
  // Every episode is in one scrolling list, each with its painting.
  await expect(page.locator('.episode-item:visible')).toHaveCount(26)
  await expect(page.locator('.episode-list')).toHaveClass(/is-pictured/)
  await expect(page.locator('.episode-item .episode-thumb img')).toHaveCount(26)
  await expect(page.getByRole('button', { name: '전체 회차 보기' })).toHaveCount(0)
  await expect(page.locator('.round-action.is-current')).toHaveCount(0)
  await expect(page.getByText(/듣기/)).toHaveCount(0)
  await expect(page.locator('.work-synopsis, .place-heading, .settings-button')).toHaveCount(0)
  await noOverflow(page)
})

test('읽기 화면 위 막대는 뒤로·회차 제목·설정뿐이고, 뒤로 가면 읽던 회차가 목록 가운데 온다', async ({ page }) => {
  await quiet(page)
  await page.goto('ep03')
  await expect(page).toHaveTitle(`3화 열두 자리 숫자 · ${rawCatalog.work.title}`)
  await expect(page.locator('.reader-bar a, .reader-bar button')).toHaveCount(2)
  await expect(page.locator('.reader-title')).toHaveText('3화 열두 자리 숫자')
  await page.locator('.reader-title').click()
  await expect(page.getByRole('dialog', { name: '목차' })).toHaveCount(0)
  await expect(page.locator('.reader-back')).toHaveAttribute('href', '/novels/bae-byunghee/#episode-ep03')
  await page.locator('.reader-back').click()
  await expect(page).toHaveURL(/bae-byunghee\/#episode-ep03$/)
  await expect.poll(() => offCenter(page, '#episode-ep03')).toBeLessThan(40)
  await noOverflow(page)
})

test('읽기 설정은 네 글자 크기·줄 간격·서체를 바로 적용하고 다시 와도 유지한다', async ({ page }) => {
  await quiet(page)
  await page.goto('ep01')
  expect(await fontSize(page)).toBe(20)
  const paragraph = page.locator('.story-content p').first()
  expect(await paragraph.evaluate(element => getComputedStyle(element).lineHeight)).toBe('42px')
  expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife Serif')
  // The chapter has no lists or subheadings, so sample their inherited typography too.
  await page.locator('.story-content').evaluate(element => {
    for (const tag of ['h2', 'h3', 'ul', 'ol']) {
      const sample = document.createElement(tag)
      sample.dataset.typographyProbe = ''
      sample.textContent = '서체 견본'
      element.appendChild(sample)
    }
  })
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '읽기 설정' })
  await expect(sheet).toBeVisible()
  const sizes = sheet.getByRole('group', { name: '글자 크기', exact: true })
  await expect(sizes.getByRole('button')).toHaveCount(4)
  await expect(sizes.getByRole('button', { name: '글자 크기 기본 20px', exact: true })).toHaveAttribute('aria-pressed', 'true')
  for (const [index, label, pixels] of [[0, '작게', 18], [1, '기본', 20], [2, '크게', 23], [3, '아주 크게', 26]] as const) {
    const option = sizes.getByRole('button', { name: `글자 크기 ${label} ${pixels}px`, exact: true })
    await expect(option).toContainText('가')
    await expect(option).toContainText(label)
    await option.click()
    await expect(option).toHaveAttribute('aria-pressed', 'true')
    await expect(sizes.locator('button[aria-pressed="true"]')).toHaveCount(1)
    await expect(page.locator('.library')).toHaveClass(new RegExp(`font-${index}`))
    expect(await fontSize(page)).toBe(pixels)
    expect(await page.evaluate(() => localStorage.getItem('family-library:font'))).toBe(String(index))
  }
  await sizes.getByRole('button', { name: '글자 크기 크게 23px', exact: true }).click()
  await expect(page.locator('.library')).toHaveClass(/font-2/)
  const leading = sheet.getByRole('group', { name: '줄 간격', exact: true })
  const faces = sheet.getByRole('group', { name: '서체', exact: true })
  await expect(leading.getByRole('button', { name: '넓게', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(faces.getByRole('button', { name: '명조', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await faces.getByRole('button', { name: '명조', exact: true }).evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife Serif')
  expect(await faces.getByRole('button', { name: '고딕', exact: true }).evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife UI')
  const leadingBox = (await leading.boundingBox())!
  const faceBox = (await faces.boundingBox())!
  expect(Math.abs(leadingBox.y - faceBox.y)).toBeLessThan(1)
  expect(Math.abs(leadingBox.width - faceBox.width)).toBeLessThan(1)
  for (const options of [leading, faces]) expect((await options.getByRole('button').first().boundingBox())!.height).toBe(52)
  await leading.getByRole('button', { name: '보통', exact: true }).click()
  await expect(leading.getByRole('button', { name: '보통', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await paragraph.evaluate(element => parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(1.85, 3)
  await leading.getByRole('button', { name: '넓게', exact: true }).click()
  await expect(leading.getByRole('button', { name: '넓게', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.library')).toHaveClass(/leading-wide/)
  expect(await paragraph.evaluate(element => parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(2.1, 3)
  const listLeading = await page.locator('.story-content ul, .story-content ol').evaluateAll(elements => elements.map(element => parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize)))
  expect(listLeading).toHaveLength(2)
  for (const leading of listLeading) expect(leading).toBeCloseTo(2.1, 3)
  await faces.getByRole('button', { name: '고딕', exact: true }).click()
  await expect(faces.getByRole('button', { name: '고딕', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.library')).toHaveClass(/face-sans/)
  expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife UI')
  const headings = await page.locator('.story-content h2, .story-content h3').evaluateAll(elements => elements.map(element => getComputedStyle(element).fontFamily))
  expect(headings.length).toBeGreaterThan(0)
  expect(headings.every(face => face.includes('ToldLife UI'))).toBe(true)
  expect(await page.evaluate(() => [localStorage.getItem('family-library:leading'), localStorage.getItem('family-library:face')])).toEqual(['wide', 'sans'])
  await sheet.getByRole('radio', { name: '밤' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.locator('.page-reader').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(22, 23, 27)')
  await expect(sheet.getByRole('switch', { name: '배경음악' })).toHaveAttribute('aria-checked', 'false')
  expect(await sheet.getByRole('switch', { name: '배경음악' }).evaluate(element => element.closest('.sheet-body')!.lastElementChild!.contains(element))).toBe(true)
  await sheet.getByRole('button', { name: '완료' }).click()
  await expect(sheet).toBeHidden()
  await page.reload()
  await expect(page.locator('.library')).toHaveClass(/font-2/)
  await expect(page.locator('.library')).toHaveClass(/leading-wide/)
  await expect(page.locator('.library')).toHaveClass(/face-sans/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await fontSize(page)).toBe(23)
  expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife UI')
  expect(await paragraph.evaluate(element => parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(2.1, 3)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(sizes.getByRole('button', { name: '글자 크기 크게 23px', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(leading.getByRole('button', { name: '넓게', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(faces.getByRole('button', { name: '고딕', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('radio', { name: '종이' }).click()
  expect(await page.locator('.page-reader').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 242, 235)')
  await leading.getByRole('button', { name: '보통', exact: true }).click()
  await faces.getByRole('button', { name: '명조', exact: true }).click()
  expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife Serif')
  expect(await paragraph.evaluate(element => parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(1.85, 3)
  expect(await page.evaluate(() => [localStorage.getItem('family-library:leading'), localStorage.getItem('family-library:face')])).toEqual(['normal', 'serif'])
  await sheet.getByRole('button', { name: '완료' }).click()
  await page.reload()
  await expect(page.locator('.library')).toHaveClass(/leading-normal/)
  await expect(page.locator('.library')).toHaveClass(/face-serif/)
  expect(await paragraph.evaluate(element => parseFloat(getComputedStyle(element).lineHeight) / parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(1.85, 3)
  await noOverflow(page)
})

test('설정 시트는 본문을 가리지 않고 짧은 화면에서 안쪽만 스크롤한다', async ({ page }) => {
  await quiet(page)
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 400 })
  await page.goto('ep01')
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
  const before = await page.evaluate(() => scrollY)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '읽기 설정' })
  await expect(sheet).toHaveClass(/is-clear-backdrop/)
  expect(await sheet.evaluate(element => getComputedStyle(element, '::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  const body = sheet.locator('.sheet-body')
  const size = await body.evaluate(element => ({ client: element.clientHeight, scroll: element.scrollHeight, overflow: getComputedStyle(element).overflowY }))
  expect(size.scroll).toBeGreaterThan(size.client)
  expect(size.overflow).toBe('auto')
  expect((await sheet.boundingBox())!.height).toBeLessThanOrEqual(400 * 0.88 + 1)
  await sheet.getByRole('switch', { name: '배경음악' }).scrollIntoViewIfNeeded()
  expect(await body.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  expect(await page.evaluate(() => scrollY)).toBe(before)
  await sheet.getByRole('button', { name: '완료' }).click()
  expect(await page.evaluate(() => scrollY)).toBe(before)
  await noOverflow(page)
})

test('본문 중간에서 글자 크기·줄 간격·서체를 바꿔도 읽던 문단 위치를 유지한다', async ({ page }) => {
  await quiet(page)
  await page.goto('ep03')
  await page.evaluate(async () => { await document.fonts.ready })
  const paragraph = page.locator('.story-content p').nth(3)
  await paragraph.evaluate(element => window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - 80, behavior: 'instant' }))
  const before = await paragraph.evaluate(element => element.getBoundingClientRect().top)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '읽기 설정' })
  for (const option of [
    sheet.getByRole('button', { name: '글자 크기 아주 크게 26px', exact: true }),
    sheet.getByRole('group', { name: '줄 간격', exact: true }).getByRole('button', { name: '보통', exact: true }),
    sheet.getByRole('group', { name: '서체', exact: true }).getByRole('button', { name: '고딕', exact: true }),
  ]) {
    await option.click()
    await expect.poll(() => paragraph.evaluate(element => Math.abs(element.getBoundingClientRect().top - 80))).toBeLessThan(2)
  }
  await sheet.getByRole('button', { name: '완료' }).click()
  expect(Math.abs(await paragraph.evaluate(element => element.getBoundingClientRect().top) - before)).toBeLessThan(2)
})

test('본문을 누르면 위아래 막대가 숨고 얇은 진행선만 남는다', async ({ page }) => {
  await quiet(page)
  await page.goto('ep02')
  await page.locator('.story-content p').nth(1).click()
  await expect(page.locator('.library')).toHaveClass(/chrome-hidden/)
  await expect.poll(() => page.locator('.reader-thin').evaluate(element => getComputedStyle(element).opacity)).toBe('1')
  await page.locator('.story-content p').nth(1).click()
  await expect(page.locator('.library')).not.toHaveClass(/chrome-hidden/)
})

test('회차 끝에는 다음 화 큰 버튼과 그 아래 이전 화만 있고, 다 읽으면 작품 홈이 다음 화를 권한다', async ({ page }) => {
  await quiet(page)
  await page.goto('ep01')
  await page.locator('.episode-end').scrollIntoViewIfNeeded()
  const nav = page.locator('.episode-nav')
  await expect(nav.locator('.big-button')).toHaveText('다음 화')
  await expect(nav.locator('.big-button')).toHaveAttribute('href', '/novels/bae-byunghee/ep02')
  await expect(nav.locator('.episode-back')).toHaveText('이전 화')
  await expect(nav.locator('.episode-back')).toHaveAttribute('href', '/novels/bae-byunghee/prolog')
  // The next episode's painting and title are not shown.
  await expect(page.locator('.episode-end img, .next-title, .next-art')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:completed') || '[]'))).toContain('ep01')
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('2화 읽기')
  await expect(bigButton(page)).toHaveAccessibleName('2화 읽기')
  await expect(page.locator('#episode-ep02')).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('#episode-ep01 .episode-progress span')).toHaveAttribute('style', /width: 100%/)
})

test('읽던 곳은 작품 홈 버튼과 진행 막대에 남고, 이어 읽으면 그 위치에서 시작한다', async ({ page }) => {
  await quiet(page)
  await page.goto('ep03')
  await page.evaluate(() => window.scrollTo(0, 900))
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:reading') || '{}').scroll)).toBeGreaterThan(800)
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('3화 이어 읽기')
  await expect(bigButton(page)).toHaveAccessibleName('3화 이어 읽기')
  const row = page.locator('#episode-ep03')
  await expect(row).toHaveAttribute('aria-current', 'true')
  await expect(row.locator('.round-action')).toHaveClass(/is-current/)
  expect(await row.locator('.episode-progress span').evaluate(element => parseFloat((element as HTMLElement).style.width))).toBeGreaterThan(0)
  await bigButton(page).click()
  await expect(page).toHaveURL(/bae-byunghee\/ep03$/)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(800)
})

test('읽던 프롤로그는 화면과 접근 가능한 이름 모두 프롤로그 이어 읽기로 표시한다', async ({ page }) => {
  await quiet(page)
  const episode = rawCatalog.readingOrder.find(entry => entry.episodeId === 'prolog')!
  await page.addInitScript(episode => {
    localStorage.setItem('family-library:bae-byunghee:reading', JSON.stringify({ id: episode.id, title: episode.title, url: `/novels${episode.url}`, scroll: 150, finished: false }))
  }, episode)
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('프롤로그 이어 읽기')
  await expect(bigButton(page)).toHaveAccessibleName('프롤로그 이어 읽기')
  await expect(bigButton(page)).toHaveAttribute('href', '/novels/bae-byunghee/prolog')
  await expect(page.locator('#episode-prolog')).toHaveAttribute('aria-current', 'true')
})

test('모든 회차를 마치면 화면과 접근 가능한 이름 모두 처음부터 다시 읽기로 표시한다', async ({ page }) => {
  await quiet(page)
  const episode = rawCatalog.readingOrder.at(-1)!
  await page.addInitScript(({ episode, completed }) => {
    localStorage.setItem('family-library:bae-byunghee:reading', JSON.stringify({ id: episode.id, title: episode.title, url: `/novels${episode.url}`, scroll: 150, finished: true }))
    localStorage.setItem('family-library:bae-byunghee:completed', JSON.stringify(completed))
  }, { episode, completed: rawCatalog.readingOrder.map(entry => entry.id) })
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('처음부터 다시 읽기')
  await expect(bigButton(page)).toHaveAccessibleName('처음부터 다시 읽기')
  await expect(bigButton(page)).toHaveAttribute('href', '/novels/bae-byunghee/prolog')
  await expect(page.locator('.episode-item.is-done')).toHaveCount(rawCatalog.readingOrder.length)
})

test('마지막 회차는 끝 표시와 흐린 다음 화로 마치고, 이전 화로는 돌아갈 수 있다', async ({ page }) => {
  await quiet(page)
  await page.goto('side')
  await page.locator('.episode-end').scrollIntoViewIfNeeded()
  await expect(page.locator('.story-end')).toHaveText('끝')
  await expect(page.locator('.episode-nav .big-button')).toHaveText('다음 화')
  await expect(page.locator('.episode-nav .big-button')).toBeDisabled()
  await expect(page.locator('.episode-nav .episode-back')).toHaveAttribute('href', '/novels/bae-byunghee/epilog')
})

test('첫 회차의 이전 화는 흐리게 자리만 지킨다', async ({ page }) => {
  await quiet(page)
  await page.goto('prolog')
  await page.locator('.episode-end').scrollIntoViewIfNeeded()
  await expect(page.locator('.episode-nav .episode-back')).toBeDisabled()
  await expect(page.locator('.episode-nav .big-button')).toHaveAttribute('href', '/novels/bae-byunghee/ep01')
})

test('옛 연대 읽기 기록을 새 회차의 제목과 주소로 이어 읽는다', async ({ page }) => {
  await quiet(page)
  await page.addInitScript(() => localStorage.setItem('family-library:reading', JSON.stringify({ id: 'life-1980s', title: '옛 제목', url: '/1980s', scroll: 1800 })))
  await page.goto('./')
  await expect(bigButton(page)).toHaveAccessibleName('12화 이어 읽기')
  await expect(page.locator('#episode-ep12')).toHaveAttribute('aria-current', 'true')
  await expect(bigButton(page)).toHaveAttribute('href', '/novels/bae-byunghee/ep12')
  await bigButton(page).click()
  await expect(page.locator('.reader-title')).toHaveText('12화 망해가는 정미소를 사다')
})

test('끝까지 읽은 옛 연대 기록은 다 읽은 회차로 두고 다음 화를 권한다', async ({ page }) => {
  await quiet(page)
  await page.addInitScript(() => localStorage.setItem('family-library:reading', JSON.stringify({ id: 'life-1980s', title: '옛 제목', url: '/1980s', scroll: 1800, finished: true })))
  await page.goto('./')
  await expect(bigButton(page)).toHaveText('13화 읽기')
  await expect(bigButton(page)).toHaveAccessibleName('13화 읽기')
  await expect(page.locator('#episode-ep12 .episode-progress span')).toHaveAttribute('style', /width: 100%/)
})

test('옛 제목 ID의 읽기·완독·이어 읽기 기록을 번호로 바꾸고 읽던 위치를 보존한다', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('family-library:bae-byunghee:reading')) return
    localStorage.setItem('family-library:reading', JSON.stringify({ id: 'ep-josae', title: '어머니의 조새', url: '/novels/bae-byunghee/josae', scroll: 480, finished: false }))
    localStorage.setItem('family-library:completed', JSON.stringify(['ep-jige', 'life-epilogue', 'ep02', 'unknown']))
    localStorage.setItem('family-library:resume', JSON.stringify({ id: 'ep-josae', title: '어머니의 조새', url: '/novels/bae-byunghee/josae', scroll: 480, finished: false }))
    localStorage.setItem('family-library:music', JSON.stringify({ enabled: false }))
  })
  await page.goto('./#episode-josae')
  await expect(page).toHaveURL(/#episode-ep01$/)
  await expect(page.locator('#episode-ep01')).toHaveAttribute('aria-current', 'true')
  await expect(bigButton(page)).toHaveAttribute('href', '/novels/bae-byunghee/ep01')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:completed')!))).toEqual(['ep02', 'epilog'])
  for (const key of ['family-library:bae-byunghee:reading', 'family-library:bae-byunghee:resume']) {
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key)).toMatchObject({ id: 'ep01', title: '어머니의 쇠갈고리', url: '/novels/bae-byunghee/ep01', scroll: 480 })
  }
  await bigButton(page).click()
  await expect(page).toHaveURL(/bae-byunghee\/ep01$/)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400)
  expect(await page.evaluate(() => localStorage.getItem('family-library:bae-byunghee:resume'))).toBeNull()
})

for (const [episodeId, oldTitle] of [['ep05', '미꾸라지 칼국수'], ['ep11', '차비 잘 챙겨라']]) {
  test(`살림 회차 ${episodeId}는 바뀐 제목으로 목차·본문·이어 읽기를 연결한다`, async ({ page }) => {
    const episode = rawCatalog.readingOrder.find(entry => entry.episodeId === episodeId)!
    await page.addInitScript(({ id, title, url }) => {
      localStorage.setItem('family-library:reading', JSON.stringify({ id, title, url, scroll: 150, finished: false }))
      localStorage.setItem('family-library:completed', JSON.stringify([id]))
      localStorage.setItem('family-library:music', JSON.stringify({ enabled: false }))
    }, { id: episode.id, title: oldTitle, url: `/novels${episode.url}` })
    await page.goto('./')
    const row = page.locator(`#episode-${episodeId}`)
    await expect(row.locator('.episode-label')).toHaveText(episode.label)
    await expect(row.locator('.episode-title')).toContainText(episode.title)
    await expect(row).toHaveAttribute('href', `/novels${episode.url}`)
    await expect(row).toHaveAttribute('aria-current', 'true')
    await expect(bigButton(page)).toHaveAccessibleName(`${episode.label} 이어 읽기`)
    await bigButton(page).click()
    await expect(page.locator('.reader-title')).toHaveText(`${episode.label} ${episode.title}`)
    await expect(page).toHaveTitle(`${episode.label} ${episode.title} · ${rawCatalog.work.title}`)
    await expect(page.locator(`[data-illustration="${episodeId}-01"]`)).toBeVisible()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('family-library:bae-byunghee:reading') || '{}').title)).toBe(episode.title)
    await noOverflow(page)
    await page.locator('.reader-back').click()
    await expect(page).toHaveTitle(rawCatalog.work.title)
  })
}

test('모든 회차의 삽화를 불러오며 16:9 전체 그림을 화면 폭에 맞춘다', async ({ page }, info) => {
  test.setTimeout(90000)
  const images = rawCatalog.illustrations as Record<string, Illustration[]>
  expect(Object.keys(images)).toHaveLength(new Set(illustrationManifest.images.map(image => image.episodeId)).size)
  expect(Object.values(images).flat()).toHaveLength(illustrationManifest.images.length)
  const broken: string[] = []
  page.on('response', response => {
    // A painting shown again (the next-episode card, then its own page) may come back as 304 Not Modified.
    if (response.url().includes('/images/episodes/') && response.status() >= 400) broken.push(response.url())
  })
  for (const [episodeId, illustrations] of Object.entries(images)) {
    await page.goto(`${episodeId}`)
    const body = await page.locator('.story-content').innerText()
    expect(body, `${episodeId} 본문에 마크다운 기호가 노출되지 않아야 합니다.`).not.toMatch(/\*\*|__|~~|`|\[[^\]]+\]\(/)
    if (episodeId === 'ep08') expect(body).toContain('‘메다르(메탈 베어링)’가')
    const figures = page.locator('.episode-illustration')
    await expect(figures).toHaveCount(illustrations.length)
    if (episodeId === 'ep01') await expect(figures).toHaveCount(2)
    if (episodeId === 'ep05') await expect(figures).toHaveCount(2)
    for (const illustration of illustrations) {
      const image = page.locator(`[data-illustration="${illustration.id}"] img`)
      await image.scrollIntoViewIfNeeded()
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
      expect(await image.evaluate((element: HTMLImageElement) => element.currentSrc)).toMatch(/\.webp$/)
      await expect(image).toHaveAttribute('alt', illustration.alt)
      await expect(image).toHaveAttribute('width', '1280')
      await expect(image).toHaveAttribute('height', '720')
      if (!illustration.position.start) {
        const figure = page.locator(`[data-illustration="${illustration.id}"]`)
        const sceneBreak = figure.locator('xpath=preceding-sibling::*[1]')
        await expect(sceneBreak).toHaveJSProperty('tagName', 'HR')
        expect(await sceneBreak.evaluate(element => getComputedStyle(element, '::after').content)).toBe('"⁂"')
        await expect(sceneBreak.locator('xpath=preceding-sibling::*[1]')).not.toHaveJSProperty('tagName', 'HR')
        const paragraph = figure.locator('xpath=following-sibling::p[1]')
        const precedingParagraphs = await figure.evaluate(element => {
          let count = 0
          for (let previous = element.previousElementSibling; previous; previous = previous.previousElementSibling)
            if (previous.tagName === 'P') count++
          return count
        })
        expect(precedingParagraphs).toBe(illustration.position.paragraphIndex)
        await expect(paragraph).toBeVisible()
      }
      const box = (await image.boundingBox())!
      expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.005)
    }
    await noOverflow(page)
  }
  expect(broken).toEqual([])
  await page.goto('ep01')
  await page.screenshot({ path: `test-results/reading/${info.project.name}-illustrated-reader.png`, fullPage: true })
})

test('자바스크립트 없이도 넓은 줄 간격·명조 기본값과 삽화를 표시한다', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('http://127.0.0.1:4183/novels/bae-byunghee/ep01')
    await expect(page.locator('.library')).toHaveClass(/leading-wide/)
    await expect(page.locator('.library')).toHaveClass(/face-serif/)
    const paragraph = page.locator('.story-content p').first()
    expect(await paragraph.evaluate(element => getComputedStyle(element).lineHeight)).toBe('42px')
    expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).toContain('ToldLife Serif')
    await expect(page.locator('.episode-illustration')).toHaveCount(2)
    const first = page.locator('.episode-illustration img').first()
    await expect.poll(() => first.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await page.goto('http://127.0.0.1:4183/novels/bae-byunghee/ep05')
    await expect(page.locator('.episode-illustration')).toHaveCount(2)
  } finally { await context.close() }
})

test('첫 삽화는 화면에 맞는 파일 하나를 사전 로딩하고 기다리는 동안 본문을 읽는다', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const requests: string[] = []
  page.on('request', request => {
    if (/ep01-01-\d+\.(webp|jpg)/.test(request.url())) requests.push(request.url())
  })
  await page.route('**/images/episodes/*', async route => { await pending; await route.continue() })
  try {
    await page.goto('ep01', { waitUntil: 'domcontentloaded' })
    const figure = page.locator('[data-illustration="ep01-01"]')
    const preload = page.locator('head link[rel="preload"][as="image"]')
    await expect(preload).toHaveCount(1)
    await expect(preload).toHaveAttribute('type', 'image/webp')
    expect(await preload.getAttribute('imagesrcset')).toBe(await figure.locator('source').getAttribute('srcset'))
    expect(await preload.getAttribute('imagesizes')).toBe(await figure.locator('img').getAttribute('sizes'))
    await expect(figure.locator('.image-placeholder')).toBeVisible()
    await expect(figure.locator('.image-placeholder svg')).toBeVisible()
    await expect(figure.locator('.image-placeholder')).toHaveText('')
    await expect(page.locator('body')).not.toContainText('그림을 불러오는 중입니다')
    await expect(page.locator('.story-content p').first()).toBeVisible()
    release()
    await expect.poll(() => figure.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    await expect(figure.locator('.image-placeholder')).toHaveCount(0)
    const current = await figure.locator('img').evaluate((img: HTMLImageElement) => img.currentSrc)
    expect(requests).toEqual([current])
  } finally { release() }
})

test('WebP 전송이 실패하면 JPG로 복구하고 모두 실패하면 다시 불러올 수 있다', async ({ page }) => {
  await page.route('**/images/episodes/ep01-01-*.webp', route => route.abort())
  await page.goto('ep01')
  const figure = page.locator('[data-illustration="ep01-01"]')
  await expect.poll(() => figure.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(await figure.locator('img').evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/-720\.jpg$/)
  await expect(figure.locator('.image-error')).toHaveCount(0)

  await page.route('**/images/episodes/ep01-01-*.jpg', route => route.abort())
  await page.reload()
  await expect(figure.locator('.image-error')).toBeVisible()
  await expect(page.locator('.story-content p').filter({ hasText: '배병희' }).first()).toBeVisible()
  await page.unroute('**/images/episodes/ep01-01-*.webp')
  await page.unroute('**/images/episodes/ep01-01-*.jpg')
  await figure.getByRole('button', { name: '그림 다시 불러오기' }).click()
  await expect(figure.locator('.image-error')).toHaveCount(0)
  await expect.poll(() => figure.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(await figure.locator('img').evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\.webp\?retry=1$/)
})

test('여섯 회차의 삽화는 해당 장면에서 시작하고 대표 그림은 첫 그림과 별도로 유지한다', async ({ page }) => {
  const targets = [
    ['ep06', 'ep06-01', '갯벌에서 져 온 생김을 마당에 부려놓으면', ['ep06-02', 'ep06-01']],
    ['ep08', 'ep08-01', '여러 마을을 오가며 기계를 계속 돌리다 보니', ['ep08-02', 'ep08-03', 'ep08-01']],
    ['ep11', 'ep11-family-care', '열여덟 평 독정리 집은', ['ep11-family-care', 'ep11-01']],
    ['ep13', 'ep13-01', '먹구름이 몰려와 한밤중에 장대비가 퍼붓기 시작하면', ['ep13-02', 'ep13-01']],
    ['ep14', 'ep14-01', '그는 다시 농지 일부를 처분해 자금을 마련했다.', ['ep14-02', 'ep14-01']],
    ['ep15', 'ep15-01', '이튿날에도 배병희는 아무 일 없었다는 듯', ['ep15-02', 'ep15-01', 'ep15-03']],
  ] as const
  for (const [episode, representativeId, followingText, order] of targets) {
    await page.goto(`${episode}`)
    expect(await page.locator('.episode-illustration').evaluateAll(figures => figures.map(figure => figure.getAttribute('data-illustration')))).toEqual(order)
    const representative = page.locator(`[data-illustration="${representativeId}"]`)
    await expect(representative.locator('xpath=following-sibling::p[1]')).toContainText(followingText)
    const preload = page.locator('head link[rel="preload"][as="image"]')
    await expect(preload).toHaveCount(1)
    await expect(preload).toHaveAttribute('imagesrcset', new RegExp(`${representativeId}-360\\.webp`))
    await expect(representative.locator('img')).toHaveAttribute('loading', 'eager')
    await expect(representative.locator('img')).toHaveAttribute('fetchpriority', 'high')
    if (episode === 'ep11') {
      await expect(page.locator('[data-illustration="ep11-01"]').locator('xpath=following-sibling::p[1]'))
        .toContainText('수원에서 자취하며 고등학교에 다니던 큰딸은')
    }
    if (['ep06', 'ep13'].includes(episode)) {
      expect(await page.locator('.story-content p').first().evaluate(paragraph => {
        let previous = paragraph.previousElementSibling
        while (previous) {
          if (previous.classList.contains('episode-illustration')) return true
          previous = previous.previousElementSibling
        }
        return false
      })).toBe(false)
    }
  }
})

test('영상에서 온 사람에게는 작품 위에 그 영상의 원작임을 한 줄로 보여 준다', async ({ page }) => {
  await quiet(page)
  await page.goto('./?from=nureon-bongtu')
  const origin = page.locator('.work-origin')
  await expect(origin).toHaveText('누런 봉투의 원작')
  await expect(origin).toHaveAttribute('href', '/videos/bae-byunghee/nureon-bongtu')
  await expect(origin.locator('img')).toHaveAttribute('src', /\/novels\/works\/bae-byunghee\/images\/films\/nureon-bongtu-poster\.jpg$/)
  await expect(bigButton(page)).toHaveText('처음부터 읽기')
  await noOverflow(page)
  for (const address of ['./', './?from=unknown']) {
    await page.goto(address)
    await expect(page.locator('[data-reader-ready="true"]')).toBeVisible()
    await expect(page.locator('.work-origin')).toHaveCount(0)
  }
})
