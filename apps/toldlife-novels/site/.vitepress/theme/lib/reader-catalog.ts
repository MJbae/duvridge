import rawCatalog from '../../generated/catalog.json'
import type { MusicCatalog } from '../../shared/background-music.mjs'
import type { ReaderCatalog, ReaderEpisode, Place } from '@duvridge/content-processing/types'
export type Reading = { id: string; title: string; url: string }
export type Episode = ReaderEpisode
export type Neighbor = { title: string; label: string; url: string }
export const catalog = rawCatalog as ReaderCatalog & {
  title: string
  readingOrder: Episode[]
  legacyIds: Record<string, string>
  legacyScrollResetIds: string[]
  places: Place[]
  documents: Reading[]
  music: MusicCatalog | null
}
