import type { NarrationCue } from './narration-cues.mjs'

type Track = { duration: number; cues: readonly NarrationCue[] }
type Saved = { id: string; time: number }
type Session = { id: string; playing: boolean; failed: boolean }
type SessionTime = { id: string; playing: boolean; time: number }
export type PlayerMode = 'playing' | 'paused' | 'error' | 'resume' | 'idle' | 'replay' | 'unavailable'
export type PlayerTarget = { id: string; mode: PlayerMode; time?: number }
export type ListenState =
  | { kind: 'playing' }
  | { kind: 'progress' | 'done' | 'ready'; minutes: number }
  | { kind: 'unavailable' }
export function playerTarget(input: {
  readingOrder: readonly { id: string }[]
  narration: Record<string, Track>
  page: string
  session: Session | null
  saved: Saved | null
  completed: readonly string[]
}): PlayerTarget | null
export function resumeStart(cues: readonly NarrationCue[], time: number): number
export function minutesLeft(duration: number, time: number): number
export function listenState(id: string, state: {
  narration: Record<string, Track>
  session: SessionTime | null
  saved: Saved | null
  completed: readonly string[]
}): ListenState
