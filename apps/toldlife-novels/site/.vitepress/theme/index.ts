import { defineComponent, h } from 'vue'
import CatalogLayout from '@duvridge/reader-ui/components/CatalogLayout.vue'
import type { Theme } from 'vitepress'
import NovelReaderLayout from './NovelReaderLayout.vue'
import ResponsiveImage from '@duvridge/reader-ui/components/ResponsiveImage.vue'
import './novel-reader.css'

export default { Layout: defineComponent({ setup() { const catalogs = import.meta.glob('../generated/works/*.json'); return () => h(CatalogLayout, { catalogs, layout: NovelReaderLayout }) } }), enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
