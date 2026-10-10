import { readFileSync } from 'node:fs'
import { workStorageKey, migrateWorkStorage } from '../packages/reader-ui/src/state/work-storage.mjs'
const template = new URL('../apps/toldlife-portal/index.html', import.meta.url)
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c')
const icons = {
  videos: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  chevron: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
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
    if (!work) continue
    try { migrateWorkStorage(localStorage, work) } catch {}
    const saved = read(workStorageKey(work.id, 'narration'))
    if (!saved || typeof saved.id !== 'string') continue
    const id = work.legacyIds[saved.id] || saved.id
    const episode = work.episodes.find(entry => entry.id === id)
    if (!episode?.recorded) continue
    button.querySelector('span').textContent = `${episode.label} 이어 보기`
    button.href = `/videos/${work.id}/${episode.id}`
  }
}
const filmHref = film => `/videos/${escape(film.work.id)}/${escape(film.id)}`
const workCell = (format, work) => {
  const image = work.cover.src || work.cover.sources.find(source => source.width === 720)?.src || work.cover.sources[0].src
  return `<li><a href="/${format}/${escape(work.id)}/"><img src="/novels${escape(image)}" width="${work.cover.width}" height="${work.cover.height}" alt="${escape(work.cover.alt)}" loading="lazy"><span class="work-name">${escape(work.title)}</span></a></li>`
}
/** The first film leads with its original named under it, followed by the remaining films and each work's episode videos. */
function filmPanel(films, works) {
  const lead = films[0]
  const wide = lead.poster && lead.poster.width > lead.poster.height ? `<source media="(min-width: 900px)" srcset="/novels${escape(lead.poster.src)}">` : ''
  const cells = films.slice(1).map(film => `<li><a href="${filmHref(film)}"><img src="/novels${escape(film.card.src)}" width="${film.card.width}" height="${film.card.height}" alt="${escape(film.card.alt)}" loading="lazy"><span class="work-name">${escape(film.title)}</span></a></li>`).join('')
    + works.map(work => workCell('videos', work)).join('')
  return `<section id="videos" class="panel" aria-label="영상"><div class="hero"><a class="hero-art" href="${filmHref(lead)}" tabindex="-1" aria-hidden="true"><picture>${wide}<img src="/novels${escape(lead.card.src)}" width="${lead.card.width}" height="${lead.card.height}" alt="" loading="lazy"></picture></a><div class="hero-copy"><h2 class="hero-title"><a href="${filmHref(lead)}">${escape(lead.title)}</a></h2><span class="hero-origin">원작 · ${escape(lead.work.title)}</span><div class="hero-actions"><a class="big-button" href="${filmHref(lead)}">${icons.videos}<span>보기</span></a></div></div></div><ul class="works" aria-label="작품">${cells}</ul></section>`
}
export function renderPortal(works) {
  if (!works.length) throw new Error('포털에 공개할 작품이 없습니다.')
  // The invitation fills the row when no other originals remain below the featured work.
  const invite = '<li><a class="work-invite" href="https://www.duvridge.com/ko/#services"><span class="invite-card"><span class="invite-dot" aria-hidden="true"></span><span class="invite-line">살아낸 삶이<br>원작이 됩니다</span></span><span class="work-name">원작 의뢰하기</span></a></li>'
  const wideInvite = `<li><a class="work-invite work-invite--wide" href="https://www.duvridge.com/ko/#services"><span class="invite-dot" aria-hidden="true"></span><span class="invite-copy"><span class="invite-line">살아낸 삶이 원작이 됩니다</span><span class="work-name">원작 의뢰하기</span></span>${icons.chevron}</a></li>`
  // Films made from the originals lead the video tab; each names the work it came from.
  const films = works.flatMap(work => (work.films ?? []).map(film => ({ ...film, work })))
  const panels = Object.entries({ novels: '오리지널 시리즈', videos: '영상' }).map(([format, label]) => {
    if (format === 'videos' && films.length) return filmPanel(films, works)
    const featured = works[0]
    const home = `/${format}/${featured.id}/`
    const first = featured.episodes.find(episode => format === 'novels' || episode.recorded)
    const image = featured.cover.src || featured.cover.sources.find(source => source.width === 720)?.src || featured.cover.sources[0].src
    const src = `/novels${image}`
    const srcset = sources => sources.map(source => `/novels${source.src} ${source.width}w`).join(', ')
    const remaining = format === 'novels' ? works.filter(work => work.id !== featured.id) : works
    const inviteOnly = format === 'novels' && !remaining.length
    const list = remaining.map(work => workCell(format, work)).join('') + (format === 'novels' ? inviteOnly ? wideInvite : invite : '')
    const art = `<picture>${featured.cover.webpSources?.length ? `<source type="image/webp" srcset="${escape(srcset(featured.cover.webpSources))}" sizes="100vw">` : ''}<img src="${escape(src)}" srcset="${escape(srcset(featured.cover.sources))}" sizes="100vw" width="${featured.cover.width}" height="${featured.cover.height}" alt="" ${format === 'novels' ? 'fetchpriority="high"' : 'loading="lazy"'}></picture>`
    const hero = format === 'novels'
      ? `<a class="hero hero--work" href="${escape(home)}" aria-label="${escape(featured.title)} 작품 보기"><span class="hero-art">${art}</span><div class="hero-copy"><div class="hero-text"><h2 class="hero-title">${escape(featured.title)}</h2><span class="hero-meta">소설 · 오디오북 · ${featured.episodes.length}화</span></div><span class="hero-chevron" aria-hidden="true">${icons.chevron}</span></div></a>`
      : `<div class="hero"><a class="hero-art" href="${escape(home)}" tabindex="-1" aria-hidden="true">${art}</a><div class="hero-copy"><h2 class="hero-title"><a href="${escape(home)}">${escape(featured.title)}</a></h2><div class="hero-actions"><a class="big-button" href="${escape(home + (first?.id ?? ''))}" data-action="${format}" data-work="${escape(featured.id)}">${icons.videos}<span>${first ? '처음부터 보기' : '준비 중'}</span></a></div></div></div>`
    return `<section id="${format}" class="panel${format === 'novels' ? ' is-active' : ''}" aria-label="${label}">${hero}<ul class="works${inviteOnly ? ' works--invite-only' : ''}" aria-label="작품">${list}</ul></section>`
  }).join('\n')
  const script = `<script>const workStorageKey=${workStorageKey.toString()};const migrateWorkStorage=${migrateWorkStorage.toString()};(${portalRuntime.toString()})(${safeJson(works)});</script>`
  return readFileSync(template, 'utf8').replace('<!-- work-panels -->', panels).replace('<!-- work-script -->', script)
}
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) process.stdout.write(renderPortal(JSON.parse(readFileSync(process.argv[2], 'utf8'))))
