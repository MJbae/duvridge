import type { Illustration } from '../markdown/episode-illustrations'
import type { EpisodeHeading } from './episode-heading.mjs'
export function loadEpisodeIllustrations(root: string, episodes: (EpisodeHeading & { body: string })[]): Record<string, Illustration[]>
