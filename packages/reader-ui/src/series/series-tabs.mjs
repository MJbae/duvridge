/**
 * The platform home's two tabs. The original series holds each work's novel and its audiobook,
 * two halves of one work page; the video tab holds what was made from the originals.
 */
export const seriesTabs = [
  { key: 'novel', label: '오리지널 시리즈', hash: 'novels' },
  { key: 'video', label: '영상', hash: 'videos' },
]

/** The tab each format lives under: the audiobook belongs to the original series. */
const tabOf = { novel: 'novel', audio: 'novel', video: 'video' }

/** Links back to the platform home, outside every reader's own base path. */
export function seriesLinks(current) {
  return seriesTabs.map(tab => ({ key: tab.key, label: tab.label, href: `/#${tab.hash}`, current: tab.key === tabOf[current] }))
}

export function seriesHomeHref(key) {
  const tab = seriesTabs.find(entry => entry.key === tabOf[key])
  return tab ? `/#${tab.hash}` : '/'
}

/** Each format's own work page; the novel's work page links to the audiobook's. */
const folders = { novel: 'novels', audio: 'audiobooks', video: 'videos' }
export function seriesWorkHref(key, workId) {
  return `/${folders[key]}/${workId}/`
}

/**
 * The switch at the top of a work page: the novel and its audiobook are two halves of the same page,
 * each at its own address. The novel comes first.
 */
export function formatLinks(workId, current) {
  return [
    { key: 'novel', label: '소설', href: seriesWorkHref('novel', workId), icon: 'book', current: current === 'novel' },
    { key: 'audio', label: '오디오북', href: seriesWorkHref('audio', workId), icon: 'headphones', current: current === 'audio' },
  ]
}

/** What each format calls opening an episode, and the icon on its buttons. */
export const seriesVerbs = { novel: '읽기', audio: '듣기', video: '보기' }
export const seriesIcons = { novel: 'book', audio: 'headphones', video: 'play' }
