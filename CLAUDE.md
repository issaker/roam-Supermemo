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

npm run format         # prettier (JS/JSX/JSON only — NOT .ts/.tsx)
npm run test-dev       # TZ=UTC jest --watch --verbose --runInBand
npm run test-debug     # TZ=UTC node --inspect-brk jest --runInBand --watch --verbose
```

## Architecture — Two Layers

```
Queue System (navigation only)          Card System (rendering / interaction)
─────────────────────────────           ────────────────────────────────────
X-axis Primary: ◀/▶, urgency sort       useCardBlock(refUid, session)
Y-axis LBL:     ▲/▼, doc-order sort       → blockInfo, hasBlockChildren
reviewUnit() — single grading action      → hasCloze (derived from block data)
                                          → showAnswers (derived + override)
                                          → algorithm (from OWN session)
```

**Card is the atom.** A card = Roam block + its session. It does not know which queue it sits in. Normal cards and LBL children use the same hook: `activeCard = useCardBlock(activeUid, facts.latestByUid[activeUid])`.

**LBL is a mini-deck.** One X-axis entry. Y-axis queue opens children in document order. Parent `nextDueDate` = earliest child due date.

**Import path alias:** `~/*` maps to `./src/*` (configured in tsconfig.json and webpack). No relative import chains needed.

## Inviolable Rules

1. **No mirrored state.** One session per uid (`facts.latestByUid`). One queue state (`primaryQueue`). One view state (`currentIndex`, `focusedChildUid`). Everything else derived.
2. **No separate code paths for normal vs LBL in card interaction.** `useCardBlock` is the single card pipeline. `reviewUnit` is the single grading action.
3. **Card algorithm from the card's OWN session.** When a card has its own session, its algorithm comes from that session (not a parent). For new cards without a session, `useCardBlock` accepts a `fallbackAlgorithm` parameter (LBL children pass the parent's algorithm; normal cards use `DEFAULT_REVIEW_CONFIG.algorithm`).
4. **Bias toward removing state, not adding sync patches.** If two states drifted apart, remove one.

## Key Modules

| Path | Role |
|------|------|
| `src/hooks/useCardBlock.ts` | Single card pipeline: block info, cloze guard, showAnswers. |
| `src/review-runtime/useReviewRuntime.ts` | Unified hook: `SessionFacts` + `ReviewViewState` + inline actions (`reviewUnit`, `updateReviewConfigAction`). Actions are `useCallback` hooks within this file, not a separate module. |
| `src/review-runtime/selectors.ts` | Pure derivation: `deriveDeckSnapshot`, `deriveChildSessionMap`. |
| `src/review-runtime/types.ts` | `SessionFacts`, `ReviewViewState`, `DeckSnapshot`. |
| `src/hooks/useLineByLineReview.ts` | LBL Y-axis: child positioning, progressive reveal. Grading delegated to `reviewUnit`. |
| `src/hooks/useCurrentCardData.tsx` | `currentCardData = latestSession` (alias). Optimistic `cardMeta` overlay with uid guard. |
| `src/hooks/useSettings.ts` | Settings store: extensionAPI primary, Roam page backup (5s debounce). |
| `src/models/session.ts` | Session model, `SchedulingAlgorithm`, `InteractionStyle`, `ReviewStatus`, `resolveBaseForCalculation` |
| `src/models/practice.ts` | Queue strategies: `sortNormalDueCardUids` (urgency), `getLblQueueState` (doc order scan). |
| `src/queries/data.ts` | Roam page read/write, session parsing (`parseLatestSession`, `mergeSessionSnapshot`), `SESSION_SNAPSHOT_KEYS` |
| `src/queries/save.ts` | Writing sessions to Roam: `savePracticeData`, `updateParentNextDueDate`, `updateReviewConfig`, `undoCardSession` |
| `src/queries/today.ts` | Due/new/completed calculation pipeline. Mutable accumulator patched across 6 steps. |
| `src/queries/settings.ts` | Settings persistence on Roam page (delete-then-create per key). |
| `src/practice.ts` | Pure scheduling math: SM2 (`supermemo`), Progressive (`progressiveInterval`), Fixed Time. |
| `src/theme.ts` | Algorithm colors, intent colors, and styled-component color tokens. Documented in `THEME_SYSTEM.md`. |

## Data Flow — App → Overlay

```
App (root)
├── useSettings → tagsList, deckConfigs, dataPageTitle
├── useCachedData → cachedData
├── usePracticeData → practiceData, today
└── PracticeSessionProvider (context values)
    └── PracticeOverlay
        ├── useReviewRuntime(practiceData, today, selectedTag, ...)
        │     → facts (SessionFacts), viewState (ReviewViewState)
        │     → deckSnapshot, focusedPrimary (derived from facts + viewState)
        │     → reviewUnit, updateReviewConfigAction
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

**Navigation:** Pure index-based. `focusPrimaryByOffset(-1)` moves to `currentIndex - 1`. After `reviewUnit` advances `currentIndex` by 1, the just-reviewed card is always at `currentIndex - 1` (cards are never removed from the queue). No special back-to-previous logic needed.

**ShowAnswers:** Per-card via `useCardBlock`. `hasCloze` is derived from block data (child blocks or `{...}` syntax in text). `showAnswers = override || defaultShowAnswers`. The override is keyed by `refUid` in `overrideMap` so each card starts with a clean slate synchronously — no effect-based reset needed.

**showAnswers reset ordering:** In `reviewUnit`, `setShowAnswers(false)` must execute BEFORE the `setViewState` that advances `currentIndex`. When keyboard shortcuts trigger grading (outside React's event batch context), the index advance synchronously re-renders and updates `activeSetShowAnswersRef.current` to the next card's setter. Calling `setShowAnswers(false)` first ensures the current card's override is reset.

**Reinsert (Forgot / LBL-Next):** `reinsertCard(uid, afterIndex, offset)` is the single common function for both Forgot and LBL-Next reinserts. It splices a DUPLICATE entry into `primaryQueue` at `afterIndex + 1 + offset`. Pure queue operation — only adds a card and increases length. Decoupled from navigation; does not affect `currentIndex` or any other system. Cards are never removed from the queue.

**Optimistic updates:** `reviewUnit` does optimistic facts update → setShowAnswers reset → focus advance → async save to Roam. `updateReviewConfigAction` optimistically updates `facts.latestByUid` and `cardMeta` before the async Roam write.

**LBL Progressive Reveal:** `lineByLineRevealedCount` is local view-state (not mirrored). Moving down reveals one more line; moving up hides all lines below current.

**Child algorithm:** `getSessionAlgorithm(childSession, fallbackAlgorithm)` — uses the child's own session algorithm if present; otherwise falls back to the provided fallback. LBL children pass the parent's algorithm as fallback; normal cards use `DEFAULT_REVIEW_CONFIG.algorithm`.

## Pitfalls

- **Build:** `library.export: 'default'` in webpack standalone config must not be removed (Roam loads via `<script>`).
- **Filename conflict:** Do NOT name a roam/js script `extension.js` — Roam reserves this name for Extension Settings. The standalone output is named `standalone.js` for this reason.
- **No runtime backward compat.** Old data MUST migrate via Data Migration panel (Settings → Data Migration).
- **`resolveBaseForCalculation`** must be called before scheduling math on same-day re-reviews, or intervals inflate.
- **`hasCloze` is derived from block data** (children or `{...}` in text), not from DOM. Do not add a useState + useEffect for it — the `init=true` pattern was replaced with pure derivation.
- **`setShowAnswers(false)` MUST precede `currentIndex` advance** in `reviewUnit`. Reordering them causes the wrong card's showAnswers override to be reset when keyboard shortcuts fire grading (Blueprint's global event listeners are outside React's batch context), breaking showAnswers for reinserted Forgot cards.
- **Standalone output:** The `standalone.js` bundle also gets the `@blueprintjs` externals — ensure CDN script tags include Blueprint for roam/js users.
- **React 17:** Project uses React 17 + Blueprint 3.x. Do not upgrade without verifying `@blueprintjs/select` v3 compatibility.
