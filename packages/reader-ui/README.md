# Reader UI

Shared Vue reading components, reading-history migration, responsive-image helpers, and reading styles. Maintained source lives under `src/` by function:

- `components/WorkHome.vue` (the work page every series shares: key art, one big button, the episode list; a work's novel and audiobook pages add equal-width `소설 | 오디오북` text tabs above the button), `EpisodeNext.vue` (the next-episode card at an episode's end), `ReaderSheet.vue` (bottom sheets, with an optional clear backdrop for reading settings), `ReaderIcon.vue`, `ReaderSettingsButton.vue`, and `ResponsiveImage.vue`.
- `series/series-tabs.mjs` names the platform home's two tabs (오리지널 시리즈 · 영상; the audiobook belongs to the original series), links back to them and builds each format's work address and the work page's format switch; `series/work-rows.mjs` turns episodes into list rows.
- `state/migrate-reading-history.mjs` preserves compatible saved reading positions and completion IDs.
- `state/reading-settings.mjs` validates saved font-size, line-spacing and typeface preferences; `series/novel-work-action.mjs` keeps the novel's visible action and reading destination in agreement.
- `images/create-image-sources.mjs` formats responsive candidates and matching preloads.
- `styles/reader.css` holds the shared look: the dark theater for work pages, players and sheets, and paper or night for reading.

Import these through `@duvridge/reader-ui/<function>/<file>`. Catalog types come from `@duvridge/content-processing/types`. Work pages receive titles, cover candidates, and rows from each app; this package contains no authored book data. Audiobook playback and cue controls remain in the audiobook app, while reactions belong to `@duvridge/reader-reactions`.
