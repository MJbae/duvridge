import { fileURLToPath } from 'node:url'
import { createReaderConfig } from '@duvridge/vitepress-reader/config/create-reader-config.mts'
import catalog from './generated/catalog.json'
import { narrationSentences } from './markdown/narration-sentences'
import narration from './generated/narration.json'

export default createReaderConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  defaultOrigin: 'https://toldlife.duvridge.com',
  defaultBase: '/audiobooks/',
  catalog,
  siteNames: { '/audiobooks/': 'ToldLife Audiobooks' },
  configureMarkdown(md) { md.use(narrationSentences, { sentences: narration }) },
})
