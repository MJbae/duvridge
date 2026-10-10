import type { HeadConfig } from 'vitepress'
import type { ReaderFontAssets } from './reader-fonts.mjs'
export function readerFontHead(manifest: ReaderFontAssets['manifest']): HeadConfig[]
export function readerFontHeadHtml(manifest: ReaderFontAssets['manifest']): string
export function readingFontPreloadScript(manifest: ReaderFontAssets['manifest']): string
