import { defineConfig, type MarkdownOptions } from 'vitepress'
import { loadEnv, searchForWorkspaceRoot } from 'vite'
import { fileURLToPath } from 'node:url'
import { episodeIllustrations } from '../markdown/render-episode-illustrations.ts'
import type { ReaderCatalog, Cover, Sharing } from '@duvridge/content-processing/types'
import { coverImageSizes, episodeImageSizes, imagePreload } from '@duvridge/reader-ui/images/create-image-sources.mjs'

type ReaderConfigOptions = {
  root: string
  defaultBase?: string
  defaultOrigin: string
  catalog: Pick<ReaderCatalog, 'illustrations'> & { work: ReaderCatalog['work'] & { cover: Cover; sharing: Sharing } }
  siteNames?: Record<string, string>
  configureMarkdown?: NonNullable<MarkdownOptions['config']>
}

/** One reading/metadata configuration; services add their own Markdown features. */
export function createReaderConfig({ root, catalog, defaultBase = '/', defaultOrigin, siteNames = {}, configureMarkdown }: ReaderConfigOptions) {
  const sharedRoot = fileURLToPath(new URL('../../', import.meta.url))
  const env = loadEnv(process.env.NODE_ENV || 'production', root, '')
  const base = process.env.SITE_BASE || env.SITE_BASE || defaultBase
  const workTitle = catalog.work.title
  const siteName = siteNames[base] || workTitle
  const siteDescription = catalog.work.sharing.description
  const siteOrigin = process.env.SITE_ORIGIN || env.SITE_ORIGIN || defaultOrigin
  const share = catalog.work.sharing.image
  const shareImage = new URL(`${base}${share.src.replace(/^\//, '')}`, siteOrigin).href
  const shareImageAlt = share.alt

  return defineConfig({
    lang: 'ko-KR',
    title: workTitle,
    titleTemplate: `:title · ${workTitle}`,
    description: siteDescription,
    base,
    lastUpdated: false,
    cleanUrls: false,
    appearance: false,
    head: [
      ['script', {}, "try{const m=localStorage.getItem('family-library:theme');if(['auto','light','dark'].includes(m))document.documentElement.dataset.theme=m}catch(e){}"],
      ['meta', { name: 'theme-color', content: '#ffffff' }],
      ['meta', { name: 'color-scheme', content: 'light dark' }],
      [
        'meta',
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      ],
      // The serif face is the default reading font, so it loads with the page instead of on demand.
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
      ['link', { id: 'serif-font', rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap' }],
      ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${base}favicon-32.png` }],
      ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: `${base}apple-touch-icon.png` }],
      ['link', { rel: 'manifest', href: `${base}site.webmanifest` }],
      ['meta', { name: 'application-name', content: siteName }],
      ['meta', { name: 'apple-mobile-web-app-title', content: siteName }],
      ['meta', { property: 'og:type', content: 'website' }],
      ['meta', { property: 'og:locale', content: 'ko_KR' }],
      ['meta', { property: 'og:site_name', content: siteName }],
      ['meta', { property: 'og:image', content: shareImage }],
      ['meta', { property: 'og:image:secure_url', content: shareImage }],
      ['meta', { property: 'og:image:type', content: share.type || 'image/png' }],
      ['meta', { property: 'og:image:width', content: String(share.width) }],
      ['meta', { property: 'og:image:height', content: String(share.height) }],
      ['meta', { property: 'og:image:alt', content: shareImageAlt }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:image', content: shareImage }],
      ['meta', { name: 'twitter:image:alt', content: shareImageAlt }],
    ],
    markdown: {
      headers: { level: [2, 3] },
      // 원고의 일반 Markdown과 사진을 지원하며 임의 HTML 실행은 허용하지 않습니다.
      config(md) {
        md.set({ html: false })
        md.use(episodeIllustrations, { base, images: catalog.illustrations || {} })
        configureMarkdown?.(md)
      },
    },
    vite: {
      envDir: root,
      server: { fs: { allow: [searchForWorkspaceRoot(root), sharedRoot] } },
      build: { chunkSizeWarningLimit: 650 },
    },
    transformPageData(pageData) {
      const isHome = pageData.frontmatter.layout === 'home'
      const title = isHome ? workTitle : String(pageData.frontmatter.shareTitle || `${pageData.title} · ${workTitle}`)
      // The client reads PageData.titleTemplate; the static head reads frontmatter.
      pageData.titleTemplate = false
      pageData.frontmatter.titleTemplate = false
      pageData.title = title
      const description = isHome
        ? siteDescription
        : String(pageData.frontmatter.description || siteDescription)
      const relative = pageData.relativePath
        .replace(/(^|\/)index\.md$/, '$1')
        .replace(/\.md$/, '.html')
      const url = new URL(`${base}${pageData.frontmatter.redirect ? String(pageData.frontmatter.redirect).replace(/^\//, '') : relative}`, siteOrigin).href
      pageData.description = description
      pageData.frontmatter.description = description
      pageData.frontmatter.head ??= []
      if (isHome) {
        const cover = catalog.work.cover
        pageData.frontmatter.head.push(imagePreload(cover.webpSources?.length ? cover.webpSources : cover.sources,
          base, coverImageSizes, cover.webpSources?.length ? 'image/webp' : 'image/jpeg'))
      } else if (pageData.frontmatter.kind === 'episode') {
        const images = catalog.illustrations || {}
        const episodeImages = images[String(pageData.frontmatter.episodeId)] ?? []
        const first = episodeImages.find(image => image.representative) ?? episodeImages[0]
        if (first) {
          pageData.frontmatter.head.push(imagePreload(first.webpSources?.length ? first.webpSources : first.sources,
            base, episodeImageSizes, first.webpSources?.length ? 'image/webp' : 'image/jpeg'))
        }
      }
      if (pageData.frontmatter.redirect) {
        const destination = `${base}${String(pageData.frontmatter.redirect).replace(/^\//, '')}`
        pageData.frontmatter.head.push(
          ['script', {}, `location.replace(${JSON.stringify(destination)}+location.hash)`],
          ['meta', { 'http-equiv': 'refresh', content: `0;url=${destination}` }]
        )
      }
      pageData.frontmatter.head.push(
        ['link', { rel: 'canonical', href: url }],
        ['meta', { property: 'og:title', content: title }],
        ['meta', { property: 'og:description', content: description }],
        ['meta', { property: 'og:url', content: url }],
        ['meta', { name: 'twitter:title', content: title }],
        ['meta', { name: 'twitter:description', content: description }]
      )
    },
  })

}
