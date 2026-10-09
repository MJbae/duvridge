export type SeriesKey = 'novel' | 'audio' | 'video'
export type SeriesTab = { key: SeriesKey; label: string; hash: string }
export type SeriesLink = { key: SeriesKey; label: string; href: string; current: boolean }
export const seriesTabs: readonly SeriesTab[]
export function seriesLinks(current: SeriesKey): SeriesLink[]
export function seriesHomeHref(key: SeriesKey): string
export const seriesVerbs: Record<SeriesKey, string>
export const seriesIcons: Record<SeriesKey, string>
