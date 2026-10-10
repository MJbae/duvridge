import type { NarrationTrack } from './narration-catalog.mjs'
export const videoDirectory: string
export const videoFilePattern: RegExp
/** The same shape as a recording's track, in the video's own times. */
export type VideoTrack = NarrationTrack
import type { WorkFilm } from '@duvridge/content-processing/types'
/** A film made from the work, with its published file. */
export type Film = WorkFilm & { src: string; duration: number; width: number; height: number }
export function loadFilms(root: string, work: { id: string; films?: WorkFilm[] }): Film[]
export function filmPages(work: { id: string; title: string }, films: Film[]): { filename: string; frontmatter: Record<string, string> }[]
export function loadVideo(root: string, tracks: Record<string, NarrationTrack>, options: { work: { id: string } }): { videos: Record<string, VideoTrack> }
