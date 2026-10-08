export type ImageSource = { src: string; width: number }
export const episodeImageSizes: string
export const coverImageSizes: string
export function coverImageSources(format: 'webp' | 'jpg'): ImageSource[]
export function imageSrcset(sources: readonly ImageSource[], base: string): string
export function imagePreload(sources: readonly ImageSource[], base: string, sizes: string, type: string): ['link', Record<string, string>]
