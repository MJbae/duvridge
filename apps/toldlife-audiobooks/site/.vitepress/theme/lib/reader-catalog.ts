import type { ReaderCatalog, ReaderEpisode, Place, Illustration, ImageSource } from '@duvridge/content-processing/types'
import rawCatalog from '../../generated/catalog.json'
import type { NarrationTrack } from '../../shared/narration-catalog.mjs'
export type { NarrationTrack }
export type Reading = { id: string; title: string; url: string }
export type Episode = ReaderEpisode
export type Neighbor = { title: string; label: string; url: string }
export type IllustrationSource = ImageSource
export type EpisodeImage = Illustration
export const catalog = rawCatalog as unknown as ReaderCatalog & {
  title: string
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
  return sources?.find(source => source.width === width)?.src ?? sources?.[0]?.src ?? catalog.work.cover?.sources.find(source => source.width === width)?.src ?? catalog.work.cover?.src ?? catalog.work.cover?.sources[0]?.src ?? ''
}
