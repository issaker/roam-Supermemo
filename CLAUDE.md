# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci                 # install dependencies (Node >= 18)
npm run dev            # webpack watch + rebuild on change
npm run build          # production → ./extension.js + ./standalone.js
npm run lint           # ESLint src/ + webpack.config.js
npm run typecheck      # tsc
npm run test           # TZ=UTC jest (all tests)
npm run check          # lint + typecheck + test (CI parity)
npx jest --no-coverage -t "test name"  # single test

npm run format         # prettier
npm run test-dev       # TZ=UTC jest --watch --verbose --runInBand
npm run test-debug     # TZ=UTC node --inspect-brk jest --runInBand --watch --verbose
```

## Architecture — Two Layers

```
Queue System (navigation only)          Card System (rendering / interaction)
─────────────────────────────           ────────────────────────────────────
X-axis Primary: ◀/▶, urgency sort       useCardBlock(refUid, session)
Y-axis LBL:     ▲/▼, doc-order sort       → blockInfo, hasBlockChildren
reviewUnit() — single grading action      → hasCloze (guard, init=true)
                                          → showAnswers (derived + override)
                                          → algorithm (from OWN session)
```

**Card is the atom.** A card = Roam block + its session. It does not know which queue it sits in. Normal cards and LBL children use the same hook: `activeCard = useCardBlock(activeUid, facts.latestByUid[activeUid])`.

**LBL is a mini-deck.** One X-axis entry. Y-axis queue opens children in document order. Parent `nextDueDate` = earliest child due date.

## Inviolable Rules

1. **No mirrored state.** One session per uid (`facts.latestByUid`). One view state (`focusedPrimaryUid`, `focusedChildUid`, `revisitDirectives`). Everything else derived.
2. **No separate code paths for normal vs LBL in card interaction.** `useCardBlock` is the single card pipeline. `reviewUnit` is the single grading action.
3. **Card algorithm from the card's OWN session, never a parent fallback.**
4. **Bias toward removing state, not adding sync patches.** If two states drifted apart, remove one.

## Key Modules

| Path | Role |
|------|------|
| `src/hooks/useCardBlock.ts` | Single card pipeline: block info, cloze guard, showAnswers. |
| `src/review-runtime/useReviewRuntime.ts` | Unified hook: `SessionFacts` + `ViewState` + selectors + actions |
| `src/review-runtime/actions.ts` | Pure action functions: `reviewUnit`, `undoLatestReview`, `updateReviewConfigAction` |
| `src/review-runtime/selectors.ts` | Pure derivation: `deriveDeckSnapshot`, `derivePrimaryQueueEntries`, `deriveFocusedPrimaryEntry` |
| `src/review-runtime/types.ts` | `SessionFacts`, `ViewState`, `DeckSnapshot`, `RevisitDirective`, `QueueEntry` |
| `src/hooks/useLineByLineReview.ts` | LBL Y-axis: child positioning, progressive reveal. Grading delegated to `reviewUnit`. |
| `src/hooks/useCurrentCardData.tsx` | `currentCardData = latestSession` (alias). Optimistic `cardMeta` overlay with uid guard. |
| `src/hooks/useSettings.ts` | Settings store: extensionAPI primary, Roam page backup (5s debounce). |
| `src/models/session.ts` | Session model, `SchedulingAlgorithm`, `InteractionStyle`, `ReviewStatus`, `resolveBaseForCalculation` |
| `src/models/practice.ts` | Queue strategies: `sortNormalDueCardUids` (urgency), `getLblQueueState` (doc order scan). |
| `src/queries/data.ts` | Roam page read/write, session parsing (`parseLatestSession`, `mergeSessionSnapshot`), `SESSION_SNAPSHOT_KEYS` |
| `src/queries/save.ts` | Writing sessions to Roam: `savePracticeData`, `updateParentNextDueDate`, `updateReviewConfig` |
| `src/queries/today.ts` | Due/new/completed calculation pipeline. Mutable accumulator patched across 6 steps. |
| `src/queries/settings.ts` | Settings persistence on Roam page (delete-then-create per key). |
| `src/practice.ts` | Pure scheduling math: SM2 (`supermemo`), Progressive (`progressiveInterval`), Fixed Time. |

## Data Flow — App → Overlay

```
App (root)
├── useSettings → tagsList, deckConfigs, dataPageTitle
├── useCachedData → cachedData
├── usePracticeData → practiceData, today
└── PracticeSessionProvider (context values)
    └── PracticeOverlay
        ├── useReviewRuntime(practiceData, today, selectedTag, ...)
        │     → facts (SessionFacts), viewState (ViewState)
        │     → deckSnapshot, queueEntries, focusedPrimary (all derived)
        │     → reviewUnit, undoLatestReview, updateReviewConfigAction
        ├── useCurrentCardData → cardMeta, algorithm, interaction
        ├── useCardBlock(activeUid, activeSession) → showAnswers, algorithm
        ├── useLineByLineReview → line-by-line navigation + grading
        ├── Footer (grading buttons, keyboard shortcuts)
        └── CardBlock / LineByLineView (card content)
```

## Settings Architecture

- **Primary store:** `extensionAPI.settings` (works in both Roam Depot and roam/js modes)
- **Backup store:** Roam data page (blocks under `settings` heading), written after 5s debounce
- **roam/js cold start:** On page reload, `extensionAPI` is empty → `loadSettingsFromPage()` restores from Roam page
- **`extension.tsx` layer:** Wraps `extensionAPI.settings` with in-memory overlay for roam/js compatibility
- **`updateSetting()`** is the single entry point — writes extensionAPI → React state → schedules page sync
- **`roamMemoSettingsChanged`** custom event: dispatched on every `set()` call, listened by `useSettings` to sync React state

## Roam Data Page Structure

```
roam/memo (page)
├── data (heading 3)
│   └── ((cardUid))
│       ├── [[Date]] 🟢  ← latest session = SINGLE SOURCE OF TRUTH
│       │   ├── algorithm:: SM2
│       │   ├── interaction:: NORMAL
│       │   ├── nextDueDate:: [[Date]]
│       │   └── sm2_grade:: 5, sm2_eFactor:: 2.5, ...
│       └── [[Date]] 🔴  ← same-day Forgot (preserved)
├── cache (heading 3)
│   └── [[tagName]]
│       └── renderMode:: normal
└── settings (heading 3)
    ├── deckConfigs:: [{"name":"memo",...}]
    └── ...
```

Field naming: `{owner}_{purpose}` (`sm2_*`, `progressive_*`, `fixed_*`). Each algorithm writes only its own fields; switching never loses data.

## Build System

Webpack produces **two outputs**:
- `extension.js` — ES module (`library.type: 'module'`), loaded by Roam extension system
- `standalone.js` — UMD (`library.export: 'default'`), loaded via `<script>` by roam/js users

Do NOT remove `library.export: 'default'` from standalone config — Roam loads via `<script>` tag.

## Key Patterns

**Navigation:** `focusPrimaryByOffset(-1)` checks `previousPrimaryUid` (set by `focusNextAfterMutation` after review) before any index-based logic. This lets the user go back to a just-reviewed card even when it has left the active queue. Cleared on first use to prevent ping-pong.

**ShowAnswers:** Per-card via `useCardBlock`. `hasCloze` starts `true` — the guard prevents SM2 answer flash until `CardBlock` confirms no cloze. `showAnswers = override || defaultShowAnswers`. Override cleared on `refUid` change.

**Revisit Directives:** When a card is Forgotten, a `RevisitDirective` is inserted into the queue (at `forgotReinsertOffset` positions after current entry) so the card reappears later in the same session. LBL-Next cards use a separate `lblNextReinsertOffset`.

**Optimistic updates:** `reviewUnit` does optimistic facts update → focus advance → async save to Roam. `updateReviewConfigAction` optimistically updates `facts.latestByUid` and `cardMeta` before the async Roam write.

**LBL Progressive Reveal:** `lineByLineRevealedCount` is local view-state (not mirrored). Moving down reveals one more line; moving up hides all lines below current.

**Child algorithm:** `getSessionAlgorithm(childSession, DEFAULT_REVIEW_CONFIG.algorithm)` — falls back to Progressive, never the parent's algorithm.

**Actions module:** `src/review-runtime/actions.ts` contains the pure action logic (`reviewUnit`, `undoLatestReview`, `updateReviewConfigAction`) extracted from the hook. These accept `RuntimeUpdaters` callbacks for state writes and are callable from both the hook and future non-React contexts.

## Pitfalls

- **Build:** `library.export: 'default'` in webpack standalone config must not be removed (Roam loads via `<script>`).
- **No runtime backward compat.** Old data MUST migrate via Data Migration panel (Settings → Data Migration).
- **`resolveBaseForCalculation`** must be called before scheduling math on same-day re-reviews, or intervals inflate.
- **`hasCloze` init=true** is load-bearing. Changing to false causes SM2 answer flash across the entire system.
- **Standalone output:** The `standalone.js` bundle also gets the `@blueprintjs` externals — ensure CDN script tags include Blueprint for roam/js users.
- **React 17:** Project uses React 17 + Blueprint 3.x. Do not upgrade without verifying `@blueprintjs/select` v3 compatibility.
