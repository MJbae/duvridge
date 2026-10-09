import catalog from '../.vitepress/generated/catalog.json'

/** One video page for every episode with a recording; the picture follows the narration. */
export default {
  paths() {
    return catalog.readingOrder
      .filter(episode => catalog.narration?.[episode.id])
      .map(episode => ({ params: { id: episode.id, episodeId: episode.episodeId, label: episode.label, title: episode.title } }))
  },
}
