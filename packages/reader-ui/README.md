# Reader UI

Shared Vue reading components, reading-history migration, responsive-image helpers, and reading styles. Maintained source lives under `src/` by function:

- `components/StoryOverview.vue`, `ReaderIcon.vue`, `ReaderSettingsButton.vue`, `ReadingLink.vue`, and `ResponsiveImage.vue`.
- `state/migrate-reading-history.mjs` preserves compatible saved reading positions and completion IDs.
- `images/create-image-sources.mjs` formats responsive candidates and matching preloads.
- `styles/reader.css` preserves the shared reading layout and selectors.

Import these through `@duvridge/reader-ui/<function>/<file>`. Catalog types come from `@duvridge/content-processing/types`. The overview receives all book titles, synopsis text, and cover candidates through `catalog.work`; this package contains no authored book data. Audiobook playback and cue controls remain in the audiobook app, while reactions belong to `@duvridge/reader-reactions`.
