import type { CueKind, NarrationCue, SrtCue } from './narration-cues.mjs'

export type NarrationTrack = { src: string; duration: number; cues: NarrationCue[] }
export type NarrationSentence = { cue: number; text: string }
type NarratedEpisode = { id: string; label: string; body: string }
type Work = { title: string; subtitle: string }
export const recordDirectory: string
export const timingDirectory: string
export function episodeParagraphs(body: string, toText?: (text: string) => string): string[]
export function classifyCues(cues: readonly Pick<SrtCue, 'text'>[], episode: Pick<NarratedEpisode, 'id' | 'label'>, work?: Work): (CueKind | null)[]
export function loadNarration(
  root: string,
  episodes: readonly NarratedEpisode[],
  options?: { work?: Work; toText?: (text: string) => string; warn?: (message: string) => void }
): { tracks: Record<string, NarrationTrack>; sentences: Record<string, NarrationSentence[]> }

export function acceptsRecordedRevision(root: string, id: string, matched: number, total: number): boolean
