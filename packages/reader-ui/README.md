# Reader UI

Shared Vue reading components, reading-history migration, responsive-image helpers, and reading styles. Maintained source lives under `src/` by function:

- `components/WorkHome.vue` (the work page every series shares: key art, one big button, the episode list), `EpisodeNext.vue` (the next-episode card at an episode's end), `ReaderSheet.vue` (bottom sheets), `ReaderIcon.vue`, `ReaderSettingsButton.vue`, and `ResponsiveImage.vue`.
- `series/series-tabs.mjs` names the platform home's three tabs (오리지널 시리즈 · 오디오북 · 영상) and links back to them; `series/work-rows.mjs` turns episodes into list rows.
- `state/migrate-reading-history.mjs` preserves compatible saved reading positions and completion IDs.
- `images/create-image-sources.mjs` formats responsive candidates and matching preloads.
- `styles/reader.css` holds the shared look: the dark theater for work pages, players and sheets, and paper or night for reading.

Import these through `@duvridge/reader-ui/<function>/<file>`. Catalog types come from `@duvridge/content-processing/types`. Work pages receive titles, cover candidates, and rows from each app; this package contains no authored book data. Audiobook playback and cue controls remain in the audiobook app, while reactions belong to `@duvridge/reader-reactions`.
