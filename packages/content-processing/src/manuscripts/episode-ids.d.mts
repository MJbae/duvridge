export function episodeId(kind: string, number?: number): string
export type LegacyEpisodeMaps = {
  legacyHeadingIds: Readonly<Record<string, string>>
  legacyDecadeIds: Readonly<Record<string, string>>
  legacyEpisodes: Readonly<Record<string, string>>
  legacyPageIds: Readonly<Record<string, string>>
  legacyReadingIds: Readonly<Record<string, string>>
  legacyScrollResetIds: readonly string[]
}
export function createLegacyEpisodeMaps(legacy?: { headingIds?: Record<string, string>; decadeIds?: Record<string, string> }): LegacyEpisodeMaps
