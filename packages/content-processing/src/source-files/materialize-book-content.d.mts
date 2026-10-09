import type { BookConfig } from '../types'
export function materializeBookContent(appRoot: string, options: { source: string; book?: BookConfig }): string[]
export const materializeContent: typeof materializeBookContent
