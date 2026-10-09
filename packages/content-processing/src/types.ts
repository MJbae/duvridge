export type ImageSource = { src: string; width: number }
export type Place = { year: number; name: string; label: string }
export type EpisodeHeading = { id: string; title: string; kind: string }
export type ManuscriptEpisode = EpisodeHeading & { number: number | null; label: string; time: string; place: Place | null; body: string }
export type Illustration = {
  id: string
  episodeId: string
  alt: string
  width: number
  height: number
  sources: ImageSource[]
  webpSources?: ImageSource[]
  representative?: boolean
  position: { start: boolean; paragraphIndex: number }
}
export type IllustrationAsset = Omit<Illustration, 'position'>
export type Cover = {
  src?: string
  alt: string
  width: number
  height: number
  sources: ImageSource[]
  webpSources?: ImageSource[]
}
export type Sharing = {
  description: string
  image: { src: string; alt: string; width: number; height: number; type?: string }
}
export type BookConfig = {
  id?: string
  manuscript?: string
  work?: { title?: string; subtitle?: string }
  cover?: Cover
  sharing?: Sharing
  legacy?: { headingIds?: Record<string, string>; decadeIds?: Record<string, string> }
  excludedEditorialFiles?: string[]
  assets?: { coverSource?: string }
}
export type ReaderEpisode = { id: string; episodeId: string; title: string; url: string; label: string; number: number | null; time: string; place: Place | null }
export type ReaderCatalog = {
  work: { title: string; subtitle: string; synopsis: string[]; schedule: string; cover?: Cover; sharing?: Sharing }
  readingOrder: ReaderEpisode[]
  documents: { id: string; title: string; url: string }[]
  illustrations?: Record<string, Illustration[]>
  legacyIds?: Record<string, string>
  legacyScrollResetIds?: readonly string[]
}
