import type { Illustration } from '@duvridge/content-processing/types'
export type EpisodeLike = { label: string; title: string; number: number | null }
export type Thumb = { src: string; srcset: string; webpSrcset?: string; alt: string }
export function episodeName(episode: EpisodeLike): string
export function episodeWindow(length: number, currentIndex: number, size?: number): { start: number; end: number }
export function progressPercent(value: number): number
export function episodeThumb(illustrations: Record<string, Illustration[]> | undefined, episodeId: string, withBase: (path: string) => string): Thumb | undefined
