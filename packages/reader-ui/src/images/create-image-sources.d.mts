import type { ImageSource } from '@duvridge/content-processing/types'
export type { ImageSource } from '@duvridge/content-processing/types'
export const episodeImageSizes: string
export const coverImageSizes: string
export function imageSrcset(sources: readonly ImageSource[], base: string): string
export function imagePreload(sources: readonly ImageSource[], base: string, sizes: string, type: string): ['link', Record<string, string>]
