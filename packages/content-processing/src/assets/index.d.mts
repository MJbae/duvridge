import type { BookConfig } from '../types'
type AssetOptions = { source: string | URL; book: BookConfig }
export function buildCoverAssets(options: AssetOptions): Promise<{ sourceFile: string; files: string[] }>
export function buildIllustrationAssets(options: AssetOptions & { ids?: string[] }): Promise<{ ids: string[]; files: string[] }>
export function buildShareAssets(options: AssetOptions): Promise<{ files: string[] }>
