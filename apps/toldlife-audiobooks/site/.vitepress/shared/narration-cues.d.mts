export type SrtCue = { start: number; end: number; text: string }
export type CueKind = 'cover' | 'title' | 'dateline' | 'music'
/** [start, end] for a sentence; the opening and the closing music carry their kind. */
export type NarrationCue = [number, number] | [number, number, CueKind]
export type SentenceLocation = { paragraph: number; start: number; end: number }
export const musicCueText: string
export function parseSrtTime(value: string): number
export function formatSrtTime(seconds: number): string
export function parseSrt(source: string): SrtCue[]
export function formatSrt(cues: readonly SrtCue[]): string
export function compact(text: string): string
export function locateSentences(paragraphs: readonly string[], sentences: readonly string[]): (SentenceLocation | null)[]
export function cueIndexAt(cues: readonly NarrationCue[], time: number): number
export function previousCueStart(cues: readonly NarrationCue[], time: number, grace?: number): number
export function nextCueStart(cues: readonly NarrationCue[], time: number): number | null
export function clock(seconds: number): string
export function spokenTime(seconds: number): string
export function listeningMinutes(seconds: number): number
