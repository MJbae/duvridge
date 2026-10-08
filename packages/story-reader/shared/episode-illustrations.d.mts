import type { Illustration } from '../markdown/episode-illustrations'
import type { EpisodeHeading } from './episode-heading.mjs'
export type IllustrationMarker = { id: string; offset: number; paragraphIndex: number; start: boolean }
export function illustrationMarkerId(line: string): string | null
export function parseIllustrationMarkers(body: string): IllustrationMarker[]
export function stripIllustrationMarkers(markdown: string): string
export function loadEpisodeIllustrations(root: string, episodes: (EpisodeHeading & { body: string })[]): Record<string, Illustration[]>
