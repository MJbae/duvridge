import type { Place } from '../../shared/episode-heading.mjs'
import rawCatalog from '../../generated/catalog.json'
import type { NarrationTrack } from '../../shared/narration-catalog.mjs'
export type { NarrationTrack }
export type Reading = { id: string; title: string; url: string }
export type Episode = Reading & { episodeId: string; label: string; number: number | null; time: string; place: Place | null }
export type Neighbor = { title: string; label: string; url: string }
export type IllustrationSource = { src: string; width: number }
export type EpisodeImage = { id: string; position: { start?: boolean }; sources: IllustrationSource[] }
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

/** The painting an episode opens with, if it has one. */
export const startIllustration = (id: string) => catalog.illustrations[id]?.find(image => image.position.start)
/** One width of an episode's opening painting, or of the cover when the episode has none. */
export function startImageSrc(id: string, width: 360 | 720) {
  const sources = startIllustration(id)?.sources
  return sources?.find(source => source.width === width)?.src ?? sources?.[0]?.src ?? `/images/home-cover-${width}.jpg`
}
