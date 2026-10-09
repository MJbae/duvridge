import type { CueKind, NarrationCue, SrtCue } from './narration-cues.mjs'

/** cues: [start, end, kind?]; texts: the words shown for each cue; scenes: [first cue, illustration ID] where the picture changes. */
export type NarrationTrack = { src: string; duration: number; cues: NarrationCue[]; texts: string[]; scenes: [number, string][] }
type NarratedEpisode = { id: string; label: string; body: string }
type Work = { title: string; subtitle: string }
export const recordDirectory: string
export const timingDirectory: string
export function episodeParagraphs(body: string, toText?: (text: string) => string): string[]
export function classifyCues(cues: readonly Pick<SrtCue, 'text'>[], episode: Pick<NarratedEpisode, 'id' | 'label'>, work?: Work): (CueKind | null)[]
export function cueDisplayText(text: string, kind: CueKind | null | undefined): string
export function loadNarration(root: string, episodes: readonly NarratedEpisode[], options?: { work?: Work }): { tracks: Record<string, NarrationTrack> }
