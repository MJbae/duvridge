import { readFileSync } from 'node:fs'
import { workStorageKey, migrateWorkStorage } from '../packages/reader-ui/src/state/work-storage.mjs'
const template = new URL('../apps/toldlife-portal/index.html', import.meta.url)
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const icons = {
  novels: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M12 6c-2.5-1.6-5.5-1.8-8-1v13c2.5-.8 5.5-.6 8 1 2.5-1.6 5.5-1.8 8-1V5c-2.5-.8-5.5-.6-8 1zM12 6v13"/></svg>',
  audiobooks: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3M4.5 14h1A1.5 1.5 0 0 1 7 15.5v3A1.5 1.5 0 0 1 5.5 20h-1A1.5 1.5 0 0 1 3 18.5v-3A1.5 1.5 0 0 1 4.5 14Zm14 0h1a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5Z"/></svg>',
  videos: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  // The audiobook's quiet button carries a smaller headphones mark.
  get audiobookButton() { return this.audiobooks.replaceAll('width="20" height="20"', 'width="18" height="18"') },
}
function portalRuntime(works) {
  const remember = (key, value) => { try { localStorage.setItem(key, value) } catch {} }
  const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null } }
  const tabs = ['novels', 'videos']
  // The audiobook tab moved inside the original series; its old addresses open that tab.
  const normalize = value => value === 'video' ? 'videos' : value === 'audiobooks' ? 'novels' : value
  const fromAddress = () => tabs.includes(normalize(location.hash.slice(1))) ? normalize(location.hash.slice(1)) : normalize(new URLSearchParams(location.search).get('tab'))
  const show = tab => {
    for (const name of tabs) {
      document.getElementById(name).classList.toggle('is-active', name === tab)
      const link = document.querySelector(`[data-tab="${name}"]`)
      if (name === tab) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current')
    }
    remember('family-library:home-tab', tab)
  }
  let saved
  try { saved = normalize(localStorage.getItem('family-library:home-tab')) } catch {}
  show(tabs.includes(fromAddress()) ? fromAddress() : tabs.includes(saved) ? saved : 'novels')
  for (const link of document.querySelectorAll('[data-tab]')) link.addEventListener('click', event => {
    event.preventDefault(); history.replaceState(null, '', `/#${link.dataset.tab}`); show(link.dataset.tab)
  })
  addEventListener('hashchange', () => { if (tabs.includes(fromAddress())) show(fromAddress()) })
  for (const button of document.querySelectorAll('[data-action]')) {
    const work = works.find(work => work.id === button.dataset.work)
    try { migrateWorkStorage(localStorage, work) } catch {}
    const tab = button.dataset.action
    const key = kind => workStorageKey(work.id, kind)
    const saved = read(key(tab === 'novels' ? 'reading' : 'narration'))
    if (!saved || typeof saved.id !== 'string') continue
    const id = work.legacyIds[saved.id] || saved.id
    const index = work.episodes.findIndex(entry => entry.id === id)
    const episode = work.episodes[index]
    if (!episode || tab !== 'novels' && !episode.recorded) continue
    const next = work.episodes[index + 1]
    const target = tab === 'novels' && saved.finished ? next : episode
    if (!target) { button.href = `/${tab}/${work.id}/`; continue }
    const verb = { novels: '읽기', videos: '보기' }[tab]
    const spoken = `${target.label} ${saved.finished && tab === 'novels' ? '' : '이어 '}${verb}`
    // The novel's button always says 소설; where it now leads is its spoken name.
    if (tab === 'novels') button.setAttribute('aria-label', `소설 ${spoken}`)
    else button.querySelector('span').textContent = spoken
    button.href = `/${tab}/${work.id}/${target.id}`
    if (tab === 'novels' && !saved.finished) button.addEventListener('click', () => remember(key('resume'), JSON.stringify({ ...saved, id })))
  }
}
export function renderPortal(works) {
  if (!works.length) throw new Error('포털에 공개할 작품이 없습니다.')
  // Both tabs list works in the same cells; only the original series ends by inviting a life to become the next original.
  const invite = '<li><a class="work-invite" href="https://www.duvridge.com/ko/#services"><span class="invite-card"><span class="invite-dot" aria-hidden="true"></span><span class="invite-line">살아낸 삶이<br>원작이 됩니다</span></span><span class="work-name">원작 의뢰하기</span></a></li>'
  const panels = Object.entries({ novels: '오리지널 시리즈', videos: '영상' }).map(([format, label]) => {
    const featured = works[0]
    const home = `/${format}/${featured.id}/`
    const first = featured.episodes.find(episode => format === 'novels' || episode.recorded)
    const image = featured.cover.src || featured.cover.sources.find(source => source.width === 720)?.src || featured.cover.sources[0].src
    const src = `/novels${image}`
    const srcset = sources => sources.map(source => `/novels${source.src} ${source.width}w`).join(', ')
    const list = works.map(work => {
      const image = work.cover.src || work.cover.sources.find(source => source.width === 720)?.src || work.cover.sources[0].src
      return `<li><a href="/${format}/${escape(work.id)}/"><img src="/novels${escape(image)}" width="${work.cover.width}" height="${work.cover.height}" alt="${escape(work.cover.alt)}" loading="lazy"><span class="work-name">${escape(work.title)}</span></a></li>`
    }).join('') + (format === 'novels' ? invite : '')
    // The original series leads with the novel; the audiobook of the same work is one quiet button beside it.
    const actions = format === 'novels'
      ? `<a class="big-button" href="${home}${first?.id ?? ''}" data-action="${format}" data-work="${featured.id}" aria-label="소설 처음부터 읽기">${icons.novels}<span>소설</span></a><a class="sub-button" href="/audiobooks/${escape(featured.id)}/">${icons.audiobookButton}<span>오디오북</span></a>`
      : `<a class="big-button" href="${home}${first?.id ?? ''}" data-action="${format}" data-work="${featured.id}">${icons[format]}<span>${first ? '처음부터 보기' : '준비 중'}</span></a>`
    return `<section id="${format}" class="panel${format === 'novels' ? ' is-active' : ''}" aria-label="${label}"><div class="hero"><a class="hero-art" href="${home}" tabindex="-1" aria-hidden="true"><picture>${featured.cover.webpSources?.length ? `<source type="image/webp" srcset="${escape(srcset(featured.cover.webpSources))}" sizes="100vw">` : ''}<img src="${escape(src)}" srcset="${escape(srcset(featured.cover.sources))}" sizes="100vw" width="${featured.cover.width}" height="${featured.cover.height}" alt="" ${format === 'novels' ? 'fetchpriority="high"' : 'loading="lazy"'}></picture></a><div class="hero-copy"><h2 class="hero-title"><a href="${home}">${escape(featured.title)}</a></h2><div class="hero-actions">${actions}</div></div></div><ul class="works" aria-label="작품">${list}</ul></section>`
  }).join('\n')
  const script = `<script>const workStorageKey=${workStorageKey.toString()};const migrateWorkStorage=${migrateWorkStorage.toString()};(${portalRuntime.toString()})(${safeJson(works)});</script>`
  return readFileSync(template, 'utf8').replace('<!-- work-panels -->', panels).replace('<!-- work-script -->', script)
}
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) process.stdout.write(renderPortal(JSON.parse(readFileSync(process.argv[2], 'utf8'))))
