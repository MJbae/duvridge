export type IllustrationMarker = { id: string; offset: number; paragraphIndex: number; start: boolean }
export function illustrationMarkerId(line: string): string | null
export function parseIllustrationMarkers(body: string): IllustrationMarker[]
export function stripIllustrationMarkers(markdown: string): string
