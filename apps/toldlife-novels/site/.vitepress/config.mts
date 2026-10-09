import { fileURLToPath } from 'node:url'
import { createReaderConfig } from '@duvridge/vitepress-reader/config/create-reader-config.mts'
import catalog from './generated/catalog.json'

export default createReaderConfig({
  root: fileURLToPath(new URL('../../', import.meta.url)),
  defaultOrigin: 'https://toldlife.duvridge.com',
  defaultBase: '/novels/',
  catalog,
  siteNames: { '/novels/': 'ToldLife Novels' },
})
