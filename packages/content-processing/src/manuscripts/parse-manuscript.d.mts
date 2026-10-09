import type { Place, EpisodeHeading, ManuscriptEpisode } from '../types'
export type { Place, EpisodeHeading, ManuscriptEpisode } from '../types'
export function parseEpisodeHeading(value: string): EpisodeHeading | null
export function parseManuscript(markdown: string, warn?: (message: string) => void, options?: { legacyEpisodes?: Record<string, string> }): { places: Place[]; episodes: ManuscriptEpisode[] }
