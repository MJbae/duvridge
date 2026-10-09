import { defineComponent, h } from 'vue'
import CatalogLayout from '@duvridge/reader-ui/components/CatalogLayout.vue'
import type { Theme } from 'vitepress'
import AudiobookReaderLayout from './AudiobookReaderLayout.vue'
import ResponsiveImage from '@duvridge/reader-ui/components/ResponsiveImage.vue'
import './audiobook-reader.css'

export default { Layout: defineComponent({ setup() { const catalogs = import.meta.glob('../generated/works/*.json'); return () => h(CatalogLayout, { catalogs, layout: AudiobookReaderLayout }) } }), enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
