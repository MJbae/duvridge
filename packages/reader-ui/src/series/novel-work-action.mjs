/** The work button names the episode it opens and preserves the marked row and resume target. */
export function novelWorkAction(order, lastRead, completed = []) {
  const index = order.findIndex(entry => entry.id === lastRead?.id)
  if (index < 0) return { label: '처음부터 읽기', episode: order[0], resume: false, current: false }
  const last = order[index]
  const finished = lastRead?.finished ?? completed.includes(last.id)
  if (!finished) return { label: `${last.label} 이어 읽기`, episode: last, resume: true, current: true }
  const next = order[index + 1] ?? order.find(entry => !completed.includes(entry.id))
  return next
    ? { label: `${next.label} 읽기`, episode: next, resume: false, current: true }
    : { label: '처음부터 다시 읽기', episode: order[0], resume: false, current: false }
}
