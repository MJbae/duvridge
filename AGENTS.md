# Repository conventions

- Use Node.js 22 and npm 10. Install from the root with `npm ci`; maintain only the root lockfile.
- Deployable services live in `apps/`, shared maintained sources in `packages/`. Declare shared workspace dependencies. Do not import another app's implementation.
- `packages/memoir-content` owns manuscript, illustrations, reference materials and background music. Materialized app copies are generated inputs, never editorial sources.
- Place illustrations using standalone `<!-- illustration: stable-id -->` markers in the manuscript. The asset manifest contains no paragraph indexes or text anchors. Preserve existing image IDs when adding images between them.
- `packages/story-reader` owns common reading UI and processing. Audiobook controls and cue interaction remain app-local; preserve their behavior when sharing UI.
- Web builds must not regenerate recordings, SRT timings or approved clips. Paid TTS/STT requires a separate explicit production task.
- Existing audio will be regenerated. Its text agreement must not constrain manuscript or illustration edits or block web builds; keep playback UI and file/timing integrity checks unchanged. New recording imports still validate against the current manuscript.
- Firebase rules and indexes live only in `packages/story-reader/firebase`; use root `firebase.json` and Java 21 for emulator tests. Web deployment does not publish Firebase rules.
- Register services in `service-registry.json` and verify change selection. Every upload to the shared ToldLife Pages project includes the portal and both readers.
- PR validation receives no deployment credentials. Upload only validated artifacts built from one commit, never the repository root.
- Run repository tests for orchestration, workspace tests/build/typecheck for affected readers, and browser tests for UI/audio changes. Record actual deployment evidence in `docs/deployment-verification.md`.
- Keep `.env`, build outputs, videos and local production work out of Git. Imported source repositories are historical references, not runtime dependencies.
