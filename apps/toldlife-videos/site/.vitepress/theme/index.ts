import { defineComponent, h } from 'vue'
import CatalogLayout from '@duvridge/reader-ui/components/CatalogLayout.vue'
import type { Theme } from 'vitepress'
import VideoReaderLayout from './VideoReaderLayout.vue'
import ResponsiveImage from '@duvridge/reader-ui/components/ResponsiveImage.vue'
import './video-reader.css'

export default { Layout: defineComponent({ setup() { const catalogs = import.meta.glob('../generated/works/*.json'); return () => h(CatalogLayout, { catalogs, layout: VideoReaderLayout }) } }), enhanceApp({ app }) { app.component('ResponsiveImage', ResponsiveImage) } } satisfies Theme
