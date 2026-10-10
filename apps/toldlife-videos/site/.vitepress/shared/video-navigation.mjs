export function sceneCountLabel(count) {
  return `장면 보기 · ${count}개`
}

export function episodeNeighbours(order, id, isPlayable) {
  const index = order.findIndex(episode => episode.id === id)
  if (index < 0) return { previous: undefined, next: undefined, nextPlayable: undefined }
  let previous
  for (let position = index - 1; position >= 0; position--) {
    if (isPlayable(order[position].id)) {
      previous = order[position]
      break
    }
  }
  const next = order[index + 1]
  return { previous, next, nextPlayable: next && isPlayable(next.id) ? next : undefined }
}
