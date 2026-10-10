export function sceneCountLabel(count: number): string
export function episodeNeighbours<T extends { id: string }>(order: readonly T[], id: string, isPlayable: (id: string) => boolean): {
  previous: T | undefined
  next: T | undefined
  nextPlayable: T | undefined
}
