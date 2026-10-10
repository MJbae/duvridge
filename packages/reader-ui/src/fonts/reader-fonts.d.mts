import type { HeadConfig } from 'vitepress'
import type { Plugin } from 'vite'
export type ReaderFontAssets = { directory: string; manifest: { version: number; signature: string; stylesheet: string; faces: { file: string; sha256: string; bytes: number; family: string; weight: string; unicodeRange: string; common: boolean }[] }; head: HeadConfig[] }
export function unicodeRange(points: number[]): string
export function partitionCharacters(available: number[], common: string, shardSize?: number): number[][]
export function prepareReaderFonts(repositoryRoot?: string): Promise<ReaderFontAssets>
export function readerFontsPlugin(directory: string): Plugin
export function copyReaderFonts(directory: string, outDir: string): Promise<void>
