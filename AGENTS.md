# Repository conventions

- Use Node.js 22 and npm 10. Install from the root with `npm ci`; maintain only the root lockfile.
- Deployable services live in `apps/`, shared maintained sources in `packages/`. Declare shared workspace dependencies. Do not import another app's implementation.
- Authored book data lives outside packages in `content/books/<book-id>/`. Edit `manuscript.md`, `book.json`, illustration/music manifests and original assets there. Materialized app copies are generated inputs, never editorial sources.
- Place illustrations using standalone `<!-- illustration: stable-id -->` markers in the manuscript. The asset manifest contains no paragraph indexes or text anchors. Preserve existing image IDs when adding images between them.
- Shared packages contain reusable code and are separated by function: `content-processing`, `reader-ui`, `reader-reactions`, and `vitepress-reader`. Keep manuscripts, media and book-specific text/metadata out of packages. Audiobook controls and cue interaction remain app-local.
- Web builds must not regenerate recordings, SRT timings or approved clips. Paid TTS/STT requires a separate explicit production task.
- Existing audio will be regenerated. Its text agreement must not constrain manuscript or illustration edits or block web builds; keep playback UI and file/timing integrity checks unchanged. New recording imports still validate against the current manuscript.
- Firebase rules and indexes live only in `packages/reader-reactions/firestore`; use root `firebase.json` and Java 21 for emulator tests. Web deployment does not publish Firebase rules.
- Register services and their book-source bindings in `service-registry.json`; verify code and editorial-data change selection. Every upload to the shared ToldLife Pages project includes the portal and both readers.
- PR validation receives no deployment credentials. Upload only validated artifacts built from one commit, never the repository root.
- Run repository tests for orchestration, workspace tests/build/typecheck for affected readers, and browser tests for UI/audio changes. Record actual deployment evidence in `docs/deployment-verification.md`.
- Keep `.env`, build outputs, videos and local production work out of Git. Imported source repositories are historical references, not runtime dependencies.
