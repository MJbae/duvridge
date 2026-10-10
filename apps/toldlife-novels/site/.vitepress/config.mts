import { fileURLToPath } from 'node:url'
import { createReaderConfig, formerPageRules } from '@duvridge/vitepress-reader/config/create-reader-config.mts'
import catalogs from './generated/catalogs.json'
import { prepareReaderFonts } from '@duvridge/reader-ui/fonts/reader-fonts.mjs'
const series: string = 'novels'
const catalog = Object.values(catalogs)[0]
export default createReaderConfig({
  fonts: await prepareReaderFonts(),
  root: fileURLToPath(new URL('../../', import.meta.url)),
  defaultOrigin: 'https://toldlife.duvridge.com', defaultBase: `/${series}/`, catalog, catalogs, series,
  siteNames: { '/novels/': '인생원작', '/audiobooks/': '인생원작', '/videos/': '인생원작' },
  themeConfig: { series },
  preparePage(pageData) {
    const entry = catalogs[pageData.frontmatter.workId as keyof typeof catalogs]
    if (entry && pageData.frontmatter.layout === 'home') pageData.frontmatter.shareTitle = entry.work.title
  },
  movedPages({ base, work }) {
    const entry = catalogs[work as keyof typeof catalogs]
    const pages = entry?.formerPages
    if (!pages) return []
    const home = `${base}${work}/`
    if (series === 'videos') {
      const episodes = Object.fromEntries(Object.entries(pages).filter(([, target]) => target && entry.readingOrder.some(episode => episode.id === target)))
      return [{ from: '/audiobooks/watch/', to: home }, { from: '/audiobooks/watch', to: home }, { from: '/audiobooks/watch/index.html', to: home },
        ...formerPageRules({ folder: '/audiobooks/watch/', home, pages: episodes })]
    }
    return formerPageRules({ folder: `/${series}/read/`, home, pages })
  },
})
