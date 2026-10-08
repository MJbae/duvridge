import { fileURLToPath } from 'node:url'
import { createReaderConfig } from '@duvridge/story-reader/vitepress-config.mts'
import catalog from './generated/catalog.json'

export default createReaderConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  defaultBase: '/novels/',
  catalog,
  siteNames: { '/novels/': 'ToldLife Novels' },
})
