/** Numbered episodes read "3화 열두 자리 숫자"; the prologue and other named parts keep a dot. */
export function episodeName(episode) {
  if (!episode.label) return episode.title
  return episode.number ? `${episode.label} ${episode.title}` : `${episode.label} · ${episode.title}`
}

/** Progress shown under a thumbnail, as a whole percentage between 0 and 100. */
export function progressPercent(value) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.min(1, Math.max(0, value)) * 100)
}

/** The representative painting of an episode as responsive candidates for a small thumbnail. */
export function episodeThumb(illustrations, episodeId, withBase) {
  const images = illustrations?.[episodeId] ?? []
  const image = images.find(entry => entry.representative) ?? images[0]
  if (!image) return undefined
  const candidates = list => (list ?? []).map(source => `${withBase(source.src)} ${source.width}w`).join(', ')
  const small = image.sources.find(source => source.width === 360) ?? image.sources[0]
  return { src: withBase(small.src), srcset: candidates(image.sources), webpSrcset: candidates(image.webpSources) || undefined, alt: image.alt }
}
