# Reader font sources

These are offline build inputs for the ToldLife readers, derived from Hahmlet and IBM Plex Sans KR at Google Fonts commit `bd8f81ddb5c74d5c8897b36ad88b440266245103`. `sources.json` records the upstream URLs, original SHA-256 checksums, renamed input checksums and supported Unicode characters.

The family, full and PostScript names were changed to **ToldLife Serif** and **ToldLife UI** using FontTools. Glyph outlines and metrics are unchanged. The UI name avoids the reserved font name `Plex` when distributing modified subsets. Copyright and license records are retained; both upstream OFL files accompany every published bundle.

`prepareReaderFonts()` produces WOFF2 subsets locally using the pinned `subset-font` dependency. The common serif subset contains published titles and fixed headings. The common UI subsets also contain interface text and basic Latin characters, punctuation and digits. Remaining subsets partition the full upstream character map, so characters outside the current common set can still load on demand. Hahmlet keeps a single variable weight range from 400 to 800.

Inputs are cached under the repository's ignored `.deploy/reader-fonts/` directory. Changing a title, interface text, generator or source version changes the input signature. Font and CSS filenames contain SHA-256 fingerprints of their actual content. Each reader build contains an identical `fonts/` bundle; the Pages assembler verifies all bundles and publishes one copy at `/fonts/`.

The generator and source TTFs are build tools, not browser or deployment inputs. The deployment renderer uses the dependency-free `font-head.mjs` helper and never regenerates fonts. For a source refresh, update the pinned upstream revision, rename the input name records, regenerate character maps and checksums, retain both OFL files, and verify the rendered titles and reading text before committing.
