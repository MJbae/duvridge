export type SeriesKey = 'novel' | 'audio' | 'video'
export type SeriesTab = { key: SeriesKey; label: string; hash: string }
export type SeriesLink = { key: SeriesKey; label: string; href: string; current: boolean }
export const seriesTabs: readonly SeriesTab[]
export function seriesLinks(current: SeriesKey): SeriesLink[]
export function seriesHomeHref(key: SeriesKey): string
export function seriesWorkHref(key: SeriesKey, workId: string): string
export type FormatLink = { key: 'novel' | 'audio'; label: string; href: string; icon: string; current: boolean }
export function formatLinks(workId: string, current: 'novel' | 'audio'): FormatLink[]
export const seriesVerbs: Record<SeriesKey, string>
export const seriesIcons: Record<SeriesKey, string>
