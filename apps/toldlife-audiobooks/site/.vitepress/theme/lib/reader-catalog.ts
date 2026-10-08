import type { Place } from '../../shared/episode-heading.mjs'
import rawCatalog from '../../generated/catalog.json'
import type { NarrationTrack } from '../../shared/narration-catalog.mjs'
export type { NarrationTrack }
export type Reading = { id: string; title: string; url: string }
export type Episode = Reading & { episodeId: string; label: string; number: number | null; time: string; place: Place | null }
export type Neighbor = { title: string; label: string; url: string }
export type IllustrationSource = { src: string; width: number }
export type EpisodeImage = { id: string; representative?: boolean; position: { start?: boolean }; sources: IllustrationSource[] }
export const catalog = rawCatalog as unknown as {
  title: string
  work: { title: string; subtitle: string; synopsis: string[]; episodeCount: number; schedule: string }
  readingOrder: Episode[]
  legacyIds: Record<string, string>
  legacyScrollResetIds: string[]
  places: Place[]
  documents: Reading[]
  illustrations: Record<string, EpisodeImage[]>
  narration: Record<string, NarrationTrack>
}

/** Player and lock-screen artwork stays the same when inline illustrations move. */
export function representativeIllustration(id: string) {
  const images = catalog.illustrations[id]
  return images?.find(image => image.representative) ?? images?.[0]
}
/** One width of the episode's representative painting, with a cover fallback. */
export function representativeImageSrc(id: string, width: 360 | 720) {
  const sources = representativeIllustration(id)?.sources
  return sources?.find(source => source.width === width)?.src ?? sources?.[0]?.src ?? `/images/home-cover-${width}.jpg`
}
