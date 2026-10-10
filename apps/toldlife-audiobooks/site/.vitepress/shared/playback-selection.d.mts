import type { NarrationCue } from './narration-cues.mjs'

type Episode = { id: string }
type Track = { cues: NarrationCue[] }
export type ListenAction = { id: string; kind: 'resume' | 'next' | 'start' | 'again' }
export function listenAction(options: {
  readingOrder: readonly Episode[]
  narration: Record<string, Track>
  saved: { id: string; time: number } | null
  completed: readonly string[]
}): ListenAction | null
export function resumeStart(cues: readonly NarrationCue[], time: number): number
export const sleepChoices: readonly number[]
export function nextSleepChoice(value: number): number
export function sleepLabel(value: number): string
export function lyricLines(texts: readonly string[], cueIndex: number): { previous: number; current: number; next: number }
export function proseCueTexts(texts: readonly string[], cues: readonly NarrationCue[]): string[]
export function sceneAt(scenes: readonly [number, string][], cueIndex: number): string | undefined
export function sceneStarts(scenes: readonly [number, string][], cues: readonly NarrationCue[]): { image: string; start: number }[]
