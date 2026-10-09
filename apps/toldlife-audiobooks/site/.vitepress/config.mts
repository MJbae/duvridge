import { fileURLToPath } from 'node:url'
import { createReaderConfig } from '@duvridge/vitepress-reader/config/create-reader-config.mts'
import catalog from './generated/catalog.json'

const workTitle = catalog.work.title

export default createReaderConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  defaultOrigin: 'https://toldlife.duvridge.com',
  defaultBase: '/audiobooks/',
  catalog,
  siteNames: { '/audiobooks/': 'ToldLife Audiobooks' },
  // The video pages come from one dynamic route; each takes its episode's titles from the route parameters.
  preparePage(pageData) {
    if (pageData.frontmatter.layout === 'watch-home') {
      pageData.frontmatter.shareTitle = `${workTitle} · 영상`
      return
    }
    const params = pageData.params
    if (pageData.frontmatter.kind !== 'watch' || !params) return
    Object.assign(pageData.frontmatter, {
      pageId: params.id, episodeId: params.episodeId, label: params.label,
      shareTitle: `${params.label} ${params.title} · ${workTitle}`,
    })
    pageData.title = params.title
  },
})
