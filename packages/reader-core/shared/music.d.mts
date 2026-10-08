export type MusicTrack = { id: string; src: string; label: string }
export type MusicCatalog = { home: MusicTrack; episodes: Record<string, MusicTrack> }
export function loadMusic(root: string, episodes: { id: string; label: string; kind: string; number: number | null }[]): MusicCatalog | null
