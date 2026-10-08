export type Place = { year: number; name: string; label: string }
export type EpisodeHeading = { id: string; title: string; kind: string }
export const legacyEpisodes: Record<string, string>
export function parseEpisodeHeading(value: string): EpisodeHeading | null
export function parseManuscript(markdown: string, warn?: (message: string) => void): { places: Place[]; episodes: (EpisodeHeading & { number: number | null; label: string; time: string; place: Place | null; body: string })[] }
