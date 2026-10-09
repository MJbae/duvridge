import type { ReaderCatalog, ReaderEpisode, Place, Illustration, ImageSource } from '@duvridge/content-processing/types'
import { withBase } from 'vitepress'
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

export type SceneImage = { src: string; srcset: string; webpSrcset?: string; alt: string }
const candidates = (sources: readonly ImageSource[] | undefined) => (sources ?? []).map(source => `${withBase(source.src)} ${source.width}w`).join(', ')

/** A scene's picture: one of the book's illustrations, or the cover the prologue opens with. */
export function sceneImage(id: string | undefined): SceneImage | undefined {
  if (!id) return undefined
  const cover = catalog.work.cover
  if (id === 'cover' && cover) {
    const src = cover.src || cover.sources.find(source => source.width === 720)?.src || cover.sources[0]?.src || ''
    return { src: withBase(src), srcset: candidates(cover.sources), webpSrcset: candidates(cover.webpSources) || undefined, alt: cover.alt }
  }
  const image = Object.values(catalog.illustrations).flat().find(entry => entry.id === id)
  if (!image) return undefined
  const src = image.sources.find(source => source.width === 720)?.src ?? image.sources[0]?.src ?? ''
  return { src: withBase(src), srcset: candidates(image.sources), webpSrcset: candidates(image.webpSources) || undefined, alt: image.alt }
}

/** The illustration that stands for an episode, for lists and the next-episode card. */
export function episodeImage(id: string) {
  return sceneImage(representativeIllustration(id)?.id)
}
