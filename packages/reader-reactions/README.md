# Reader reactions

`@duvridge/reader-reactions` owns the shared reaction controls, optimistic browser state, Firestore persistence and backend access rules. Apps consume its reaction component and configuration through workspace dependencies. It uses `reader-ui` for icons; `reader-ui` does not depend on reactions.

| Area | Responsibility |
| --- | --- |
| `src/model/reaction-model.ts` | Reaction options, counts, state and persistence contract; no UI or SDK imports |
| `src/state/create-reaction-store.ts` | Instant choices, subscriptions, pending writes, cache and retry; lazy persistence loading |
| `src/persistence/firestore-reaction-store.ts` | Aggregate reads and authenticated writes; depends on the model, never the browser store |
| `src/firebase/` | Public Firebase settings, client reuse and anonymous authentication |
| `src/components/ReaderReactionBar.vue` | Existing accessible reaction markup, using `reader-ui` icons |
| `firestore/rules`, `firestore/indexes`, `firestore/tests` | One maintained backend policy and its emulator regression suite |

`createReactionStore()` and `createFirebaseClient()` provide isolated instances. The exported convenience functions retain a single default instance for the two existing readers. A store can receive a persistence loader for isolated state tests; the default loader imports the Firestore adapter only when needed.

Compatibility identifiers remain `family-comments` for the Firebase app, `memoir-${pageId}` for stored pages and `family-library:reaction:` for local storage. The anonymous account is created only on a save. The deployed five-field aggregate/index shape, including retired `remember` counts, is retained while the UI keeps its four visible options.

Run state tests with `npm run test --workspace @duvridge/reader-reactions`. Run policy tests with root `npm run test:rules` and Java 21; these use only the local demo emulator. Root `firebase.json` references this package's policy files. Web deployments never deploy Firebase rules or migrate production data.
