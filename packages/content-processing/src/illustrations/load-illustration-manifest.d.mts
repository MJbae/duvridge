import type { Illustration, ManuscriptEpisode } from '../types'
export type { Illustration } from '../types'
export { illustrationMarkerId, parseIllustrationMarkers, stripIllustrationMarkers } from './parse-illustration-markers.mjs'
export function loadEpisodeIllustrations(root: string, episodes: ManuscriptEpisode[]): Record<string, Illustration[]>
export const loadIllustrationManifest: typeof loadEpisodeIllustrations
