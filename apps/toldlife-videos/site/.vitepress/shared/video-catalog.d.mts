import type { NarrationTrack } from './narration-catalog.mjs'
export const videoDirectory: string
export const videoFilePattern: RegExp
/** The same shape as a recording's track, in the video's own times. */
export type VideoTrack = NarrationTrack
export function loadVideo(root: string, tracks: Record<string, NarrationTrack>, options: { work: { id: string } }): { videos: Record<string, VideoTrack> }
