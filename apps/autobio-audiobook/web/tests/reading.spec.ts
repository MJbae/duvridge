import { expect, test, type Page } from '@playwright/test'
import { legacyEpisodes } from '../site/.vitepress/shared/episode-heading.mjs'
import rawCatalog from '../site/.vitepress/generated/catalog.json' with { type: 'json' }
import type { Illustration } from '../site/.vitepress/markdown/episode-illustrations'
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true) }

const player = (page: Page) => page.getByRole('region', { name: '오디오북 플레이어' })

test('작품 홈은 26편 목록과 아래 플레이어로 시작하고 회차를 누르면 원고를 연다', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: '내 논을 파는 한이 있어도', exact: true })).toBeVisible()
  const cover = page.locator('.home-cover img')
  await expect(cover).toHaveAttribute('alt', '가을 논을 배경으로 정장을 입은 배병희의 수채화 초상')
  await expect.poll(() => cover.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  expect(await cover.evaluate((image: HTMLImageElement) => image.currentSrc)).toMatch(/\/images\/home-cover-\d+\.webp$/)
  const coverBox = (await cover.boundingBox())!
  expect(Math.abs(coverBox.width / coverBox.height - 16 / 9)).toBeLessThan(0.01)
  expect(coverBox.y).toBeLessThan(80)
  if (info.project.name !== 'desktop') expect(coverBox.width).toBe(page.viewportSize()!.width)
  // Settings sits on the byline under the cover, never on top of the portrait.
  const settings = page.getByRole('button', { name: '설정', exact: true })
  expect((await settings.boundingBox())!.y).toBeGreaterThanOrEqual(coverBox.y + coverBox.height)
  expect(await settings.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  await expect(page.locator('.home-portrait')).toHaveCount(0)
  await expect(page.locator('.chapter-row')).toHaveCount(26)
  await expect(page.locator('.place-heading')).toHaveCount(4)
  await expect(page.getByRole('navigation', { name: '부별 바로가기' })).toHaveCount(0)
  expect(await page.locator('.work-synopsis p').allTextContents()).toEqual(rawCatalog.work.synopsis)
  await expect(page.locator('.resume-link')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '한 번에 읽기', exact: true })).toHaveCount(0)
  const synopsis = (await page.locator('.work-synopsis').boundingBox())!
  const chapters = (await page.locator('.chapter-list').boundingBox())!
  expect(chapters.y).toBeGreaterThanOrEqual(synopsis.y + synopsis.height)
  await expect(player(page)).toContainText('프롤로그 벼 한 톨의 무게')
  await expect(player(page).locator('.player-action')).toHaveText('듣기')
  await noOverflow(page)
  await page.screenshot({ path: `test-results/reading/${info.project.name}-home.png`, fullPage: true })
  await page.locator('#episode-prolog').click()
  await expect(page).toHaveURL(/read\/prolog\.html$/)
  await expect(page.locator('.article-header h1')).toHaveText('벼 한 톨의 무게')
  await expect(page.locator('.story-content')).toContainText('내 논을 파는 한이 있어도')
  await expect(page.locator('.reader-toolbar a, .reader-toolbar button')).toHaveCount(2)
  await expect(page.locator('#comments, #reactions')).toHaveCount(0)
  await noOverflow(page)
  expect(errors).toEqual([])
})

test('회차 끝 한 줄로 이전·다음 화를 잇고 목록의 해당 줄로 돌아간다', async ({ page }) => {
  await page.goto('read/prolog.html')
  await expect(page.locator('.previous-episode')).toHaveCount(0)
  await expect(page.locator('.episode-navigation')).toHaveCount(1)
  await expect(page.locator('.episode-position')).toHaveText('프롤로그')
  await expect(page.locator('.next-episode')).toHaveText('다음 화')
  await expect(page.locator('.next-episode')).toHaveAccessibleName('다음 화')
  await page.locator('.next-episode').scrollIntoViewIfNeeded()
  await page.locator('.next-episode').click()
  await expect(page).toHaveURL(/read\/ep01\.html$/)
  await expect(page.locator('.article-label')).toHaveText('1화')
  await expect(page.locator('.article-time')).toContainText('안면도 중장리')
  await expect(page.locator('.previous-episode')).toHaveCount(1)
  await expect(page.locator('.previous-episode')).toHaveAttribute('href', '/bae-memoir/read/prolog.html')
  await expect(page.locator('.episode-end').getByRole('link', { name: '목록', exact: true })).toHaveCount(0)
  const back = (await page.locator('.back-link').boundingBox())!
  await page.mouse.click(back.x + back.width / 2, back.y + back.height / 2)
  await expect(page).toHaveURL(/#episode-ep01$/)
  // Moving on to an episode plays it, so the list shows it as the one being heard.
  await expect(page.locator('#episode-ep01')).toContainText('재생 중')
  await noOverflow(page)
})

test('모든 글자 크기에서도 회차 이동 한 줄은 넘치지 않고 누르기 쉽다', async ({ page }, info) => {
  // This episode's next title caused the old button to reach four title lines at 320px.
  await page.goto('read/ep08.html')
  // Continuing episodes have no end mark; ⁂ remains reserved for scene breaks.
  await expect(page.locator('.story-end')).toHaveCount(0)
  expect(await page.locator('.story-content hr').first().evaluate(element => getComputedStyle(element, '::after').content)).toBe('"⁂"')
  for (const label of ['작게', '기본', '크게', '아주 크게']) {
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click()
    await page.keyboard.press('Escape')
    const previous = page.locator('.previous-episode')
    const next = page.locator('.next-episode')
    await expect(previous).toHaveText('이전 화')
    await expect(next).toHaveText('다음 화')
    await expect(page.locator('.episode-position')).toHaveText('8화')
    await previous.scrollIntoViewIfNeeded()
    const left = (await previous.boundingBox())!, right = (await next.boundingBox())!
    expect(Math.abs(left.y - right.y)).toBeLessThan(1)
    expect(left.height).toBeGreaterThanOrEqual(48)
    expect(right.height).toBeGreaterThanOrEqual(48)
    expect(left.x + left.width).toBeLessThan(right.x)
    for (const link of [previous, next]) {
      expect(await link.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      expect(await link.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    }
    await noOverflow(page)
  }
  await page.locator('.episode-navigation').screenshot({ path: `test-results/reading/${info.project.name}-episode-navigation.png` })
  await page.locator('.previous-episode').click()
  await expect(page).toHaveURL(/read\/ep07\.html$/)
  await page.goto('read/prolog.html')
  await expect(page.locator('.previous-episode')).toHaveCount(0)
  expect((await page.locator('.next-episode').boundingBox())!.height).toBeGreaterThanOrEqual(48)
})

test('네 단계 글자 크기를 기억한다', async ({ page }) => {
  await page.goto('read/ep01.html')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const settings = page.getByRole('dialog')
  await settings.getByRole('button', { name: '아주 크게', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('.library')).toHaveClass(/font-3/)
  await expect(page.locator('.story-content p').first()).toHaveCSS('font-size', '26px')
  await expect(page.locator('.reader-actions .settings-button')).toHaveCSS('font-size', '18px')
  await noOverflow(page)
})

test('옛 제목 ID의 재생 완료 기록과 목차 링크를 번호로 바꾼다', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('family-library:completed')?.includes('epilog')) return
    localStorage.setItem('family-library:completed', JSON.stringify(['ep-jige', 'life-epilogue', 'ep02', 'unknown']))
  })
  await page.goto('./#episode-josae')
  await expect(page).toHaveURL(/#episode-ep01$/)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:completed')!))).toEqual(['ep02', 'epilog'])
  await expect(page.locator('#episode-ep02').getByRole('img', { name: '재생 완료' })).toBeVisible()
})

test('끝까지 읽은 옛 기록은 완료 목록이 없어도 목차에서 재생 완료로 이어진다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-library:reading', JSON.stringify({ id: 'life-1980s', title: '옛 제목', url: '/read/1980s.html', scroll: 1800, finished: true })))
  await page.goto('./')
  await expect(page.locator('#episode-ep12').getByRole('img', { name: '재생 완료' })).toBeVisible()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('family-library:completed')!))).toEqual(['ep12'])
  // The reading record stays: the web novel on the same site address still uses it.
  expect(await page.evaluate(() => localStorage.getItem('family-library:reading'))).not.toBeNull()
})

for (const [episodeId] of [['ep05'], ['ep11']]) {
  test(`살림 회차 ${episodeId}는 바뀐 제목으로 목차와 본문을 연결한다`, async ({ page }) => {
    const episode = rawCatalog.readingOrder.find(episode => episode.episodeId === episodeId)!
    await page.addInitScript(({ id }) => localStorage.setItem('family-library:completed', JSON.stringify([id])), { id: episode.id })
    await page.goto('./')
    await expect(page).toHaveTitle(rawCatalog.work.title)
    const row = page.locator(`#episode-${episodeId}`)
    await expect(row.locator('.chapter-title')).toHaveText(`${episode.label} ${episode.title}`)
    await expect(row).toHaveAttribute('href', `/bae-memoir${episode.url}`)
    await expect(row.locator('.read-label')).toBeVisible()
    await row.click()
    await expect(page.locator('.article-header h1')).toHaveText(episode.title)
    await expect(page.locator('.article-time')).toHaveText(episode.time)
    await expect(page).toHaveTitle(`${episode.label} ${episode.title} · ${rawCatalog.work.title}`)
    await expect(page.locator(`[data-illustration="${episodeId}-01"]`)).toBeVisible()
    await noOverflow(page)
    await page.locator('.back-link').click()
    await expect(page).toHaveTitle(rawCatalog.work.title)
  })
}

test('기기 화면 모드와 직접 고른 화면 모드를 적용하고 기억한다', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('read/ep01.html')
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim())).toBe('#1c2024')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '밝게', exact: true }).click()
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim())).toBe('#ffffff')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: '어둡게', exact: true }).click()
  await page.getByRole('button', { name: '아주 크게', exact: true }).click()
  await page.keyboard.press('Escape')
  await noOverflow(page)
  await page.locator('.next-episode').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `test-results/reading/${info.project.name}-dark-reader.png`, fullPage: true })
})

test('본문 문단은 글자 크기에 비례한 간격과 균형 잡힌 줄바꿈을 쓴다', async ({ page }) => {
  await page.goto('read/ep05.html')
  const paragraph = page.locator('.story-content p').first()
  await expect(paragraph).toHaveCSS('margin-bottom', '30px')
  expect(await paragraph.evaluate(element => getComputedStyle(element).getPropertyValue('text-wrap-style') || getComputedStyle(element).getPropertyValue('text-wrap'))).toContain('pretty')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '아주 크게', exact: true }).click()
  await expect(paragraph).toHaveCSS('margin-bottom', '39px')
})

test('처음 읽을 때는 기본 글자 크기·넓은 줄 간격·명조로 본문을 보여 준다', async ({ page }) => {
  await page.goto('read/ep05.html')
  const paragraph = page.locator('.story-content p').first()
  await expect(page.locator('.library')).toHaveClass(/font-1/)
  await expect(paragraph).toHaveCSS('font-size', '20px')
  await expect(paragraph).toHaveCSS('line-height', '42px')
  expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).toContain('Gowun Batang')
  await expect.poll(() => paragraph.evaluate(() => document.fonts.check('20px "Gowun Batang"', '가'))).toBe(true)
  // The serif face belongs to the story, so the toolbar and settings keep the interface font.
  expect(await page.locator('.reader-toolbar').evaluate(element => getComputedStyle(element).fontFamily)).not.toContain('Gowun Batang')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '설정', exact: true })
  for (const name of ['기본', '넓게', '명조']) await expect(dialog.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('줄 간격과 서체를 바꾸면 본문에만 적용하고 다시 열어도 기억한다', async ({ page }) => {
  await page.goto('read/ep05.html')
  const paragraph = page.locator('.story-content p').first()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '설정', exact: true })
  await dialog.getByRole('button', { name: '보통', exact: true }).click()
  await dialog.getByRole('button', { name: '고딕', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '보통', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(paragraph).toHaveCSS('line-height', '37px')
  expect(await paragraph.evaluate(element => getComputedStyle(element).fontFamily)).not.toContain('Gowun Batang')
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(page.locator('.library')).toHaveClass(/leading-normal/)
  await expect(page.locator('.library')).toHaveClass(/face-sans/)
  await expect(paragraph).toHaveCSS('line-height', '37px')
  await noOverflow(page)
})

test('회차 끝은 본문과 넓게 떨어진 구분 표시 뒤에 상자 없는 회차 이동 한 줄을 둔다', async ({ page }) => {
  for (const [url, size, gap] of [['read/ep05.html', '기본', 64], ['read/ep05.html', '아주 크게', 78], ['read/side.html', '기본', 64]] as const) {
    await page.goto(url)
    await page.getByRole('button', { name: '설정', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: size, exact: true }).click()
    await page.keyboard.press('Escape')
    const gaps = await page.evaluate(() => {
      const box = (element: Element | null) => element!.getBoundingClientRect()
      const mark = document.querySelector('.story-break, .story-end')
      const navigation = document.querySelector('.episode-navigation')!
      return {
        mark: mark!.className,
        story: Math.round(box(mark).top - box([...document.querySelectorAll('.story-content p')].at(-1)!).bottom),
        navigation: Math.round(box(navigation).top - box(mark).bottom),
        lines: [getComputedStyle(navigation).borderTopStyle, getComputedStyle(navigation).borderBottomStyle],
      }
    })
    // Continuing episodes get a quiet break; only the last story says 끝.
    expect(gaps).toEqual({ mark: url.includes('side') ? 'story-end' : 'story-break', story: gap, navigation: 40, lines: ['solid', 'solid'] })
    expect(await page.locator('.next-episode').evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  }
})

test('키보드로 보기 설정을 열고 닫는다', async ({ page }) => {
  await page.goto('read/ep01.html')
  const trigger = page.getByRole('button', { name: '설정', exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '작게', exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(page.locator('.library')).toHaveClass(/font-0/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('23화에서 에필로그·외전·목록까지 이어진다', async ({ page }) => {
  await page.goto('read/ep23.html')
  await expect(page.locator('.story-end')).toHaveCount(0)
  const titleOf = (id: string) => rawCatalog.readingOrder.find(episode => episode.id === id)!.title
  await page.locator('.next-episode').click()
  await expect(page).toHaveURL(/read\/epilog\.html$/)
  // The address changes before the next page renders, so wait for its title before tapping again.
  await expect(page.locator('.article-header h1')).toHaveText(titleOf('epilog'))
  await expect(page.locator('.story-end')).toHaveCount(0)
  await page.locator('.next-episode').click()
  await expect(page).toHaveURL(/read\/side\.html$/)
  await expect(page.locator('.article-header h1')).toHaveText(titleOf('side'))
  await expect(page.locator('.story-end')).toHaveText('끝')
  await expect(page.locator('.next-episode')).toHaveText('목차')
  await expect(page.locator('.next-episode')).toHaveAccessibleName('전체 회차 보기')
  await expect(page.locator('.next-episode-title')).toHaveCount(0)
  await expect(page.locator('.episode-end').getByRole('link', { name: '목록', exact: true })).toHaveCount(0)
  await page.locator('.next-episode').click()
  await expect(player(page)).toContainText('프롤로그 벼 한 톨의 무게')
  await expect(page.getByRole('link', { name: '한 번에 읽기', exact: true })).toHaveCount(0)
  await noOverflow(page)
})

test('옛 주소 36개는 자바스크립트 없이 번호 회차로 이동한다', async ({ browser }) => {
  test.setTimeout(90000)
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    for (const [old, id] of Object.entries(legacyEpisodes)) {
      await page.goto(`http://127.0.0.1:4183/bae-memoir/read/${old}.html`)
      await expect(page).toHaveURL(new RegExp(`read/${id}\\.html$`))
      await expect(page.locator('.article-header h1')).toBeVisible()
    }
  } finally { await context.close() }
})

test('옛 회차 주소의 반응 위치 링크도 번호 주소에서 유지한다', async ({ page }) => {
  await page.goto('read/josae.html#reactions')
  await expect(page).toHaveURL(/read\/ep01\.html#reactions$/)
  await expect(page.locator('.article-header h1')).toHaveText('어머니의 쇠갈고리')
})

test('모든 회차의 삽화를 불러오며 16:9 전체 그림을 화면 폭에 맞춘다', async ({ page }, info) => {
  test.setTimeout(90000)
  const images = rawCatalog.illustrations as Record<string, Illustration[]>
  expect(Object.keys(images)).toHaveLength(26)
  expect(Object.values(images).flat()).toHaveLength(46)
  const broken: string[] = []
  page.on('response', response => {
    if (response.url().includes('/images/episodes/') && !response.ok()) broken.push(response.url())
  })
  for (const [episodeId, illustrations] of Object.entries(images)) {
    await page.goto(`read/${episodeId}.html`)
    const body = await page.locator('.story-content').innerText()
    expect(body, `${episodeId} 본문에 마크다운 기호가 노출되지 않아야 합니다.`).not.toMatch(/\*\*|__|~~|`|\[[^\]]+\]\(/)
    if (episodeId === 'ep08') expect(body).toContain("‘메다르(메탈 베어링)’가")
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
        await expect(paragraph).toHaveText(illustration.position.beforeParagraph!)
      }
      const box = (await image.boundingBox())!
      expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.005)
    }
    await noOverflow(page)
  }
  expect(broken).toEqual([])
  await page.goto('read/ep01.html')
  await page.screenshot({ path: `test-results/reading/${info.project.name}-illustrated-reader.png`, fullPage: true })
})

test('삽화는 자바스크립트 없이 회차에서 표시된다', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  try {
    await page.goto('http://127.0.0.1:4183/bae-memoir/read/ep01.html')
    await expect(page.locator('.episode-illustration')).toHaveCount(2)
    const first = page.locator('.episode-illustration img').first()
    await expect.poll(() => first.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await page.goto('http://127.0.0.1:4183/bae-memoir/read/ep05.html')
    await expect(page.locator('.episode-illustration')).toHaveCount(2)
    await page.goto('http://127.0.0.1:4183/bae-memoir/read/life-story.html')
    await expect(page).toHaveURL('http://127.0.0.1:4183/bae-memoir/')
    await expect(page.locator('.work-synopsis')).toBeVisible()
    await expect(page.locator('.chapter-row')).toHaveCount(26)
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
    await page.goto('read/ep01.html', { waitUntil: 'domcontentloaded' })
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
  await page.goto('read/ep01.html')
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

test('표지형 홈의 표지와 설정을 표시하고 재방문 소개는 전체 단위로 펼치고 접는다', async ({ page }, info) => {
  await page.goto('./')
  await expect(page.locator('.home-cover img')).toBeVisible()
  await expect(page.locator('.home-heading')).not.toContainText('완결')
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '설정', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '아주 크게', exact: true }).click()
  await expect(page.locator('.library')).toHaveClass(/font-3/)
  await expect(page.locator('.reading-preview, .settings-note')).toHaveCount(0)
  await page.getByRole('button', { name: '완료' }).click()
  await noOverflow(page)
  // Having heard an episode makes the next visit a return visit.
  await page.evaluate(() => localStorage.setItem('family-library:completed', JSON.stringify(['prolog'])))
  await page.reload()
  await expect(page.locator('.work-synopsis')).toBeHidden()
  await expect(page.locator('.work-synopsis p')).toHaveCount(rawCatalog.work.synopsis.length)
  for (const paragraph of await page.locator('.work-synopsis p').all()) await expect(paragraph).toBeHidden()
  const expand = page.getByRole('button', { name: '작품 소개 보기', exact: true })
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expand.click()
  expect(await page.locator('.work-synopsis p').allTextContents()).toEqual(rawCatalog.work.synopsis)
  for (const paragraph of await page.locator('.work-synopsis p').all()) await expect(paragraph).toBeVisible()
  await page.getByRole('button', { name: '작품 소개 접기', exact: true }).click()
  await expect(page.locator('.work-synopsis')).toBeHidden()
  await page.screenshot({ path: `test-results/reading/${info.project.name}-return-home.png`, fullPage: true })
  const intro = (await page.locator('.home-intro').boundingBox())!
  const chapters = (await page.locator('.chapter-list').boundingBox())!
  expect(Math.abs(intro.x - chapters.x)).toBeLessThan(1)
  expect(Math.abs(intro.width - chapters.width)).toBeLessThan(1)
})

test('목차 왼쪽 줄은 재생 완료·듣는 중·안 들음을 모양으로 구분하고 모두 들은 터전에 재생 완료를 붙인다', async ({ page }, info) => {
  const heard = rawCatalog.readingOrder.slice(0, 12).map(episode => episode.id).filter(id => id !== 'ep03')
  await page.addInitScript(({ heard }) => {
    localStorage.setItem('family-library:completed', JSON.stringify(heard))
    localStorage.setItem('family-library:narration', JSON.stringify({ id: 'ep03', time: 30 }))
  }, { heard })
  await page.goto('./')
  await expect(page.locator('.chapter-node.node-read')).toHaveCount(11)
  await expect(page.locator('.chapter-node.node-current')).toHaveCount(1)
  await expect(page.locator('.chapter-node.node-unread')).toHaveCount(14)
  await expect(page.locator('#episode-ep03 .chapter-node')).toHaveClass(/node-current/)
  await expect(page.locator('#episode-ep03')).toContainText('분 남음')
  await expect(page.getByRole('img', { name: '재생 완료' })).toHaveCount(11)
  // Screen readers hear the title first and the listening state last, as before the rail.
  await expect(page.locator('#episode-ep01')).toHaveAccessibleName(/^1화 어머니의 쇠갈고리.*재생 완료$/)
  // Every row keeps a tap cue at its end, whatever its listening state.
  await expect(page.locator('.chapter-row .chapter-cue')).toHaveCount(26)
  await expect(page.locator('.part-done')).toHaveCount(1)
  await expect(page.locator('.place-sign').filter({ has: page.locator('#place-1977') })).toContainText('재생 완료')
  await expect(page.locator('.place-sign').filter({ has: page.locator('#place-1936') })).not.toContainText('재생 완료')
  await expect(page.locator('.place-sign').filter({ has: page.locator('#place-1983') })).not.toContainText('재생 완료')
  await expect(page.locator('#episode-ep11')).toHaveClass(/rail-before-done/)
  await expect(page.locator('#episode-ep12')).not.toHaveClass(/rail-start/)
  await expect(page.locator('#episode-ep13')).not.toHaveClass(/rail-before-done/)
  await noOverflow(page)
  await page.locator('#episode-ep12').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `test-results/reading/${info.project.name}-toc-rail.png` })
})

test('설정은 글자 크기·줄 간격과 서체·화면 순서이며 아주 크게에서도 완료 단추까지 한 화면에 들어간다', async ({ page }, info) => {
  await page.goto('read/ep13.html')
  for (const viewport of [page.viewportSize()!, { width: 375, height: 548 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: '설정', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '설정', exact: true })
    await dialog.getByRole('button', { name: '아주 크게', exact: true }).click()
    await expect(page.locator('.library')).toHaveClass(/font-3/)
    await expect(dialog.getByRole('switch', { name: '배경음악' })).toHaveCount(0)
    const tops = await dialog.evaluate(element => ['.size-options', '.text-options', '.screen-options', '.settings-done']
      .map(selector => element.querySelector(selector)!.getBoundingClientRect().top))
    expect(tops).toEqual([...tops].sort((a, b) => a - b))
    // Line spacing and typeface sit side by side, and every label keeps the same gap to its options.
    expect(new Set(await dialog.locator('.pair-options').evaluateAll(groups => groups.map(group => Math.round(group.getBoundingClientRect().top)))).size).toBe(1)
    expect(new Set(await dialog.locator('.settings-label').evaluateAll(labels => labels.map(label =>
      Math.round(label.nextElementSibling!.getBoundingClientRect().top - label.getBoundingClientRect().bottom)))).size).toBe(1)
    await expect(dialog.locator('.reading-preview, .settings-note')).toHaveCount(0)
    expect(await dialog.locator('.size-sample').evaluateAll(samples => samples.map(sample => getComputedStyle(sample).fontSize)))
      .toEqual(['18px', '20px', '23px', '26px'])
    expect(await dialog.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
    const done = (await dialog.getByRole('button', { name: '완료' }).boundingBox())!
    expect(done.y + done.height).toBeLessThanOrEqual(viewport.height)
    await noOverflow(page)
    await page.screenshot({ path: `test-results/reading/${info.project.name}-settings-${viewport.width}x${viewport.height}.png` })
    await dialog.getByRole('button', { name: '완료' }).click()
    await expect(dialog).not.toBeVisible()
  }
})
