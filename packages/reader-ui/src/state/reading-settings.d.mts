export type ReadingLeading = 'normal' | 'wide'
export type ReadingFace = 'serif' | 'sans'
export type ReadingSettings = { font: number; leading: ReadingLeading; face: ReadingFace }
export const fontSizeOptions: ReadonlyArray<{ label: string; pixels: number; sample: string }>
export const leadingOptions: ReadonlyArray<{ value: ReadingLeading; label: string }>
export const faceOptions: ReadonlyArray<{ value: ReadingFace; label: string }>
export function readingSettings(saved?: { font?: unknown; leading?: unknown; face?: unknown }): ReadingSettings
export function applyReadingSettings(settings: ReadingSettings, element?: { dataset: Record<string, string | undefined> }): void
export function readingSettingsBootstrap(): string
