export type ReadingActionEpisode = { id: string; label: string }
export type ReadingActionPosition = { id: string; finished?: boolean }
export type NovelWorkAction<T extends ReadingActionEpisode> = { label: string; episode: T; resume: boolean; current: boolean }
export function novelWorkAction<T extends ReadingActionEpisode>(order: T[], lastRead: ReadingActionPosition | null, completed?: string[]): NovelWorkAction<T>
