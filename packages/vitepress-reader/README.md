# VitePress Reader

Shared VitePress integration for a prepared reader catalog. Maintained source lives under `src/`:

- `config/create-reader-config.mts` sets common reading metadata, page links, and responsive-image preloads.
- `markdown/render-episode-illustrations.ts` renders standalone illustration markers without enabling arbitrary source HTML.

The caller supplies its app root, default public origin, base path, site name, and prepared catalog. `catalog.work.cover` and `catalog.work.sharing` supply book-specific cover and social-preview metadata. Apps may add their own Markdown features; audiobook sentence and cue processing remains app-local.

The caller's `series` selects `sharing.images.video` for videos and `sharing.images.original` for novels and audiobooks, with `sharing.image` as the fallback. This selection stays the same when `SITE_BASE` changes. Work homes share only the work title; episode titles retain their episode-and-work format.

Content parsing and illustration DTOs come from `@duvridge/content-processing`, while responsive-image helpers come from `@duvridge/reader-ui`. This package owns no manuscript or assets. `tests/reader-config.test.mjs` verifies configuration against generic book metadata. The repository owns reader content integration coverage in `tests/integration/reader-content.test.mjs`, invoked by each reader app after it materializes its selected book.
