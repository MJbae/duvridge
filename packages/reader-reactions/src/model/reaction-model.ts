// This module stays small and SDK-free so reaction buttons can respond immediately.
export const reactionOptions = [
  { key: 'heart', icon: 'heart', label: '응원해요' },
  { key: 'like', icon: 'thumb', label: '좋아요' },
  { key: 'moved', icon: 'drop', label: '뭉클해요' },
  { key: 'wow', icon: 'sparkle', label: '대단해요' },
] as const
export type Reaction = typeof reactionOptions[number]['key']
export type Counts = Record<Reaction, number>
export const emptyCounts = (): Counts => ({ heart: 0, like: 0, moved: 0, wow: 0 })
export type ReactionState = { counts: Counts; selected: Reaction | null; error: string }

export type ReactionPersistence = {
  fetchReactions(pageId: string): Promise<{ counts: Counts; selected: Reaction | null }>
  saveReaction(pageId: string, selected: Reaction | null): Promise<void>
}
