import type { Place } from './shared/episode-heading.mjs'
export type ReaderEpisode = { id: string; episodeId: string; title: string; url: string; label: string; number: number | null; time: string; place: Place | null }
export type ReaderCatalog = { work: { title: string; subtitle: string; synopsis: string[]; schedule: string }; readingOrder: ReaderEpisode[]; documents: { id: string; title: string; url: string }[] }
