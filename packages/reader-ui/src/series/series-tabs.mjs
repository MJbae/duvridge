/**
 * The platform home's three tabs. Each tab is one format, and its work pages and episodes
 * never point to another format; only the home switches between them.
 */
export const seriesTabs = [
  { key: 'novel', label: '오리지널 시리즈', hash: 'novels' },
  { key: 'audio', label: '오디오북', hash: 'audiobooks' },
  { key: 'video', label: '영상', hash: 'videos' },
]

/** Links back to the platform home, outside every reader's own base path. */
export function seriesLinks(current) {
  return seriesTabs.map(tab => ({ key: tab.key, label: tab.label, href: `/#${tab.hash}`, current: tab.key === current }))
}

export function seriesHomeHref(key) {
  const tab = seriesTabs.find(entry => entry.key === key)
  return tab ? `/#${tab.hash}` : '/'
}

/** What each format calls opening an episode, and the icon on its buttons. */
export const seriesVerbs = { novel: '읽기', audio: '듣기', video: '보기' }
export const seriesIcons = { novel: 'book', audio: 'headphones', video: 'play' }
