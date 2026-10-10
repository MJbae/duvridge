export type SceneImage = { src: string; srcset: string; webpSrcset?: string; alt: string }
import type { ReaderCatalog, ReaderEpisode, Place, Illustration, ImageSource } from '@duvridge/content-processing/types'
import { withBase } from 'vitepress'
import { useWorkCatalog } from '@duvridge/reader-ui/catalog/work-catalog.ts'
import type { NarrationTrack } from '../../shared/narration-catalog.mjs'
import type { Film } from '../../shared/video-catalog.mjs'
export type { NarrationTrack }
export type Reading = { id: string; title: string; url: string }
export type Episode = ReaderEpisode
export type Neighbor = { title: string; label: string; url: string }
export type IllustrationSource = ImageSource
export type EpisodeImage = Illustration
export type Catalog = ReaderCatalog & {
  title: string
  readingOrder: Episode[]
  legacyIds: Record<string, string>
  legacyScrollResetIds: string[]
  places: Place[]
  documents: Reading[]
  illustrations: Record<string, EpisodeImage[]>
  narration: Record<string, NarrationTrack>
  /** Each recorded episode's video: the same sentences and scenes as the recording, in the video's own times. */
  video: Record<string, NarrationTrack>
  /** Films made from the work, each with its own page. */
  films: Film[]
}
export const useCatalog = () => useWorkCatalog<Catalog>()


export function useCatalogHelpers() {
  const catalog = useCatalog()
  /** What this app plays: the episode's video. */
  const narrationFor = (id: string): NarrationTrack | undefined => catalog.video?.[id]
  /** The recording the audiobook plays; the place both formats share is kept in its times. */
  const audioFor = (id: string): NarrationTrack | undefined => catalog.narration?.[id]
  const episodePath = (id: string) => withBase(catalog.readingOrder.find(entry => entry.id === id)?.url ?? `/${catalog.work.id}/`)

  /** The work's home in this build's series; with an episode, scrolled to that episode's row. */
  function workHome(episodeId?: string) {
    return withBase(`/${catalog.work.id}/`) + (episodeId ? `#episode-${episodeId}` : '')
  }

  /** Player and lock-screen artwork stays the same when inline illustrations move. */
  function representativeIllustration(id: string) {
    const images = catalog.illustrations[id]
    return images?.find(image => image.representative) ?? images?.[0]
  }


  const candidates = (sources: readonly ImageSource[] | undefined) => (sources ?? []).map(source => `${withBase(source.src)} ${source.width}w`).join(', ')

  /** A scene's picture: one of the book's illustrations, or the cover the prologue opens with. */
  function sceneImage(id: string | undefined): SceneImage | undefined {
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
  function episodeImage(id: string) {
    return sceneImage(representativeIllustration(id)?.id)
  }

  return { catalog, narrationFor, audioFor, episodePath, workHome, representativeIllustration, sceneImage, episodeImage }
}
