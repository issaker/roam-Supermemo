# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

项目修改原则：

要有大局观：基于项目的整体架构和功能模块来实现当前需求，不要为了解决眼前的问题就大量制造碎片化数据流破坏金字塔中枢数据流架构的清晰、可维护性。

要精简准确：不写防御性代码、不提前兼容未知需求、不写回退兜底，要让 bug 暴露出来，避免过度工程。

优先复用工具：先用已有的 Skill 或 MCP 工具，不手动模拟或重复实现。

善用 subAgent：自己负责规划与把控，将具体执行委托给 subAgent。

原生优先：优先使用宿主原生能力，禁止自定义与原生共存。仅在原生缺失时实现自定义，且确保不冲突。

必留注释 & 同步文档：修复 Bug 时注释根因与方案；修改架构时同步更新技术文档。确保可读性的信息都是最新的，不要让过时信息误导后续维护人员。

抽象重复逻辑，保持简约：发现两处及以上重复代码即抽象为公共函数；审查代码时删除冗余，遵循“如无必要，勿增实体”。

修改后自检：每次修改后运行 lint / typecheck / tests，不依赖上传后检测。

先确认，后动手：涉及系统性修改前，先与用户确认当前架构与修改方案，确保理解一致。

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

## Architecture — Pyramid Central Store

This project uses a **pyramid-style central store architecture** with a single source of truth. All review state flows through one `useReducer` + Context system. There are NO parallel state sources.

The `src/review-runtime/store/` directory (2025-05) consolidated what was previously scattered across `src/contexts/AlgorithmContext.tsx`, `src/contexts/PracticeSessionContext.tsx`, `src/hooks/useAlgorithmContext.tsx`, `src/review-runtime/useReviewRuntime.ts`, `src/review-runtime/useSessionFacts.ts`, `src/review-runtime/queue/useQueue.ts`, and `src/hooks/useCurrentCardData.tsx` into a single unified store. All old files have been deleted — all state now lives under `store/`.

### ⚠️ Critical Rule for Maintainers

**When modifying any code file, you MUST maintain the architectural integrity of the single data flow.** Do NOT introduce new Context providers, new useState chains, or new prop-drilling patterns that create parallel state sources. If you need data in a component, get it from the store via `useReviewStore()` + selectors. If you need to modify state, dispatch an action through the reducer. If you find yourself tempted to "just pass it as a prop" or "add a quick context" to solve an immediate problem — stop and think about how it fits into the pyramid.

### Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │           ReviewStoreProvider            │
                    │  (useReducer + Context — SINGLE SOURCE)  │
                    │                                         │
                    │  ReviewState:                           │
                    │    facts.latestByUid  ← session data    │
                    │    facts.pendingByUid ← saving guards   │
                    │    viewState          ← navigation      │
                    │    queues[queueId]    ← card ordering   │
                    │    selectedTag, isCramming, settings... │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────┼──────────────────────────┐
                    │              │                           │
              ┌─────▼─────┐ ┌─────▼─────┐ ┌─────────────────▼──┐
              │  Reducer   │ │ Selectors │ │    Actions         │
              │ (pure fn)  │ │ (pure fn) │ │  (async side fx)   │
              │            │ │           │ │                    │
              │ 18 actions │ │ queue,    │ │ gradeCard,         │
              │ transform  │ │ card,     │ │ undoCard,          │
              │ state      │ │ meta,     │ │ changeConfig,      │
              │ immutably  │ │ counts... │ │ ensureLatest,      │
              └────────────┘ └───────────┘ │ checkDeleted       │
                                           └────────────────────┘
                    │              │                           │
              ┌─────▼──────────────▼───────────────────────────▼──┐
              │              Consuming Components                  │
              │                                                   │
              │  PracticeOverlay  ← useReviewStore() + selectors  │
              │  Header           ← useReviewStore() + selectors  │
              │  Footer           ← MainContext (from Overlay)    │
              │  SidePanelWidget  ← useReviewStore() + selectors  │
              └───────────────────────────────────────────────────┘
```

### Data Flow Layers (Top → Down)

```
Layer 1: Store (ReviewState + reducer)
  ↕ dispatch / actions
Layer 2: Selectors (pure derivation from state)
  ↕ useMemo + selector calls
Layer 3: Components (UI rendering only)
```

**Data flows DOWN from the store. Actions flow UP to the store.** No sideways data passing between components.

### What MainContext IS and IS NOT

`MainContext` (defined in PracticeOverlay.tsx) is a **view-model context** — it passes composed callbacks and local UI state (like `fixed_multiplier`, `showAnswers`) that cannot live in the store because they depend on DOM queries or local component state. It is NOT a parallel state source — all state data in MainContext is computed FROM the store.

Components that only need store data (like Header, SidePanelWidget) should use `useReviewStore()` + selectors directly, NOT MainContext.

### How to Add a New Feature

1. **Need new state?** Add a field to `ReviewState` in `types.ts`, add an action type to `ReviewAction`, handle it in `reducer.ts`
2. **Need derived data?** Add a selector function in `selectors.ts`
3. **Need a side effect?** Add an async method to `ReviewStoreActions` in `context.tsx`
4. **Need data in a component?** Call `useReviewStore()` + selector, NOT a new Context

### Anti-Patterns to Avoid

| ❌ Anti-Pattern | ✅ Correct Pattern |
|---|---|
| Creating a new React Context for passing data | Use `useReviewStore()` + selectors |
| `useState` for data that belongs in the store | Dispatch an action to the reducer |
| Prop-drilling store data through multiple layers | Components read directly from store |
| Duplicating store data in local component state | Derive from store via selectors |
| Multiple `useMemo(() => selector(state), [state])` scattered in one component | Consolidate into a single `useMemo` returning all derived values |
| Two components maintaining separate copies of the same data | Single source in store, both read via selectors |

## Three Functional Layers

```
Pipeline (queries/)          → 2-step: classifyAllCards → allocateDailyCards, computes TagCardSets from Roam data
Queue   (store/queue-logic)  → state.uids snapshot + reinsert + mask filtering, session-stable
Runtime (store/)             → facts + viewState + queue, coordinates everything

Card System (rendering / interaction)
────────────────────────────────────
useCardBlock(refUid, session)
  → blockInfo, hasBlockChildren
  → hasCloze (derived from block data)
  → showAnswers (derived + override)
  → algorithm (from OWN session)
```

**Card is the atom.** A card = Roam block + its session. It does not know which queue it sits in. Normal cards and LBL children use the same hook: `activeCard = useCardBlock(activeUid, facts.latestByUid[activeUid])`.

**LBL is a mini-deck.** One X-axis entry. Y-axis queue opens children in document order. Parent `nextDueDate` = earliest child due date.

```
Primary Queue (◀/▶): cards sorted by due-date urgency
         │
         ├── Normal: one card = one session = one queue slot
         │
         └── LBL parent: a CONTAINER slot
              │
              └── Sub-Queue (▲/▼): child cards in doc reading order
                   ├── child 0  ←  real card, independent session
                   ├── child 1  ←  real card, independent session
                   └── child 2  ←  real card, independent session
```

**LBL Classification Rule**: LBL decks are classified from their children's collective state via `classifyCard` (which wraps `classifyLblDeck` for LBL), never from the parent's own `nextDueDate` or `dateCreated`.

| Classification | Normal Card | LBL Deck (from children) |
|---------------|-------------|--------------------------|
| **completedUids** | `dateCreated is today && isSessionMastered` | All children mastered AND ≥1 child graded today |
| **dueUids** | `!isNew && isSessionDue` | Any child due or has no session |
| **newUids** | `no session \|\| (isNew && !nextDueDate)` | All children have no session |

**Queue is snapshot, not computation.** Built once per session (date + tag + settings), never recomputed. Changes are handled by reinsert (insertion layer) and mask filtering (display layer), not by recomputing the snapshot.

**Import path alias:** `~/*` maps to `./src/*` (configured in tsconfig.json and webpack). No relative import chains needed.

## Scheduling Algorithms & Interaction Styles

| Algorithm | Description |
|-----------|-------------|
| `PROGRESSIVE` | Exponential: 2→6→12→24→48→96 days. Default for new cards. |
| `SM2` | Modified SuperMemo 2: adaptive intervals (Forgot/Hard/Good/Perfect). |
| `FIXED_TIME` | User-defined interval + unit (days/weeks/months/years). `E` key editor. |

| Interaction | Description |
|-------------|-------------|
| `NORMAL` | Standard X-axis queue card |
| `LBL` | X-axis entry that opens a Y-axis ordered-child queue. Parent-level property only. |

`interaction` is a parent-card property. Children don't own interaction mode — they are cards with their own `algorithm`.

## Inviolable Rules

1. **Single source of truth.** All review state lives in `ReviewState` (via `useReducer`). No parallel Context providers, no duplicate useState chains. If data exists in the store, components MUST read it from the store via selectors, not from props or other contexts.
2. **Queue is snapshot + reinsert + mask.** `state.uids` is the single source of truth for ordering — built once per session and never recomputed. Insertion changes go through `reinsert(uid, afterUid, offset)` which directly modifies the snapshot. Display filtering (quota mask `cardSet` + blacklist mask `removedUids`) is a pure read layer that never modifies the snapshot. The snapshot and `removedUids` are persisted to `localStorage` (key: `roam-memo:queue:{queueId}`) so page refreshes resume the session; stale entries from other days are auto-cleaned on mount.
3. **No separate code paths for normal vs LBL in card interaction.** `useCardBlock` is the single card pipeline. `reviewUnit` is the single grading action.
4. **Card algorithm from the card's OWN session.** When a card has its own session, its algorithm comes from that session (not a parent). For new cards without a session, `useCardBlock` accepts a `fallbackAlgorithm` parameter (LBL children pass the parent's algorithm; normal cards use `DEFAULT_REVIEW_CONFIG.algorithm`).
5. **Unified card classification.** `classifyCard` is the single entry point for both Normal and LBL cards. LBL cards are classified from children's collective state via `classifyLblDeck`; Normal cards from their own session.
6. **Selectors are pure functions.** They take `ReviewState` as input and return derived data. No side effects, no React hooks inside selectors. Components wrap them in `React.useMemo`.
7. **`selectCurrentCardData` returns ALL session records — both `Session` and `NewSession`.** Do NOT add `'nextDueDate' in record` filtering back. New cards (NewSession without `nextDueDate`) carry algorithm/interaction metadata set by the user via `changeConfig`. Filtering them out breaks the entire selector chain (`selectAlgorithm → selectCardMeta → selectCurrentCardData`), causing algorithm switches to revert and grading buttons to disappear. Code that needs scheduling data (e.g., `isLearned`) checks `nextDueDate` explicitly at the call site.

## Key Modules

| Path | Role |
|------|------|
| `src/review-runtime/store/types.ts` | Core types: `ReviewState`, `ReviewAction` (18 action types), `SessionFacts`, `ReviewViewState`, `QueueState`, payload types |
| `src/review-runtime/store/reducer.ts` | Pure function reducer. All state transformations. `handleGradeCard`/`handleChangeConfig` for complex flows. |
| `src/review-runtime/store/context.tsx` | `ReviewStoreProvider` + `useReviewStore`. Async actions: `gradeCard`, `undoCard`, `changeConfig`, `ensureLatestSessions`, `checkDeleted` |
| `src/review-runtime/store/selectors.ts` | Pure derivation: `selectEffectiveQueue`, `selectCurrentCardRefUid`, `selectCurrentCardData`, `selectCardMeta`, `selectAlgorithm`, `selectInteraction`, `selectCardQueueLength`, `selectIsDone`, `selectCompletedCount`, `selectSidebarCounts`, `selectTagCounts`, `selectRenderMode`, `deriveChildSessionMap` |
| `src/review-runtime/store/queue-logic.ts` | Queue pure functions: `buildInitialUids`, `loadPersistedQueue`, `savePersistedQueue`, `applyReinsert`, `syncQueueWithCardSet`, `findDeletedUids`, `computeQueueId`, `computeCardSet`, `computeTodayEnd`, `cleanStaleQueueKeys` |
| `src/review-runtime/reviewLogic.ts` | Pure business logic: `omitIsNew`, `mergeSourceIntoFacts`, `isCardCompletedToday`, `calculateChildReview`, `calculateNormalReview`, `resolveNextLblNavigation`. Testable without React. |
| `src/hooks/useCardBlock.ts` | Single card pipeline: block info, cloze guard, showAnswers. |
| `src/hooks/useLineByLineReview.ts` | LBL Y-axis: child positioning, progressive reveal. Grading delegated to store actions. |
| `src/hooks/usePracticeData.tsx` | Practice data fetch from Roam. No freezing — queue stability is handled by store. |
| `src/hooks/useSettings.ts` | Settings store: extensionAPI primary, Roam page backup (5s debounce). |
| `src/models/session.ts` | Session model, `SchedulingAlgorithm`, `InteractionStyle`, `classifyCard` (unified Normal + LBL classification). |
| `src/models/practice.ts` | Queue strategies: `sortNormalDueCardUids` (urgency), `deriveLblSubQueue` (single LBL sub-queue derivation point). |
| `src/queries/data.ts` | Roam page read/write, session parsing (`parseLatestSession`, `mergeSessionSnapshot`), `allocateDailyCards`. |
| `src/queries/save.ts` | Writing sessions to Roam: `savePracticeData` (with baseline session creation on first practice), `updateParentNextDueDate`, `updateReviewConfig`, `undoCardSession` |
| `src/queries/today.ts` | Due/new/completed calculation pipeline. All card types classified via `classifyCard`. |
| `src/queries/dataProcessing.ts` | Session parsing, `allocateDailyCards` (proportional daily limit allocation). |
| `src/practice.ts` | Pure scheduling math: SM2 (`supermemo`), Progressive (`progressiveInterval`), Fixed Time. |
| `src/theme.ts` | Algorithm colors, intent colors, and styled-component color tokens. Documented in `THEME_SYSTEM.md`. |

## Data Flow — App → Overlay

```
App (root)
├── useSettings → tagsList, deckConfigs, dataPageTitle
├── useCachedData → cachedData
├── usePracticeData → practiceData, today
└── ReviewStoreProvider (selectedTag, isCramming, tagCardSets, practiceData, settings, tagsList, ...)
    ├── SidePanelWidget ← useReviewStore() + selectSidebarCounts
    └── PracticeOverlay ← useReviewStore() + selectors
        ├── MainContext (view-model: composed callbacks + local UI state)
        ├── Header ← useReviewStore() + selectors (NO MainContext for state)
        ├── Footer ← MainContext (callbacks + local UI state)
        ├── CardBlock / LineByLineView (card content)
        └── SettingsDialog
```

## Settings Architecture

- **Primary store:** `extensionAPI.settings` (works in both Roam Depot and roam/js modes)
- **Backup store:** Roam data page (blocks under `settings` heading), written after 5s debounce
- **roam/js cold start:** On page reload, `extensionAPI` is empty → `loadSettingsFromPage()` restores from Roam page
- **`extension.tsx` layer:** Wraps `extensionAPI.settings` with in-memory overlay for roam/js compatibility
- **`updateSetting()`** is the single entry point — writes extensionAPI → React state → schedules page sync
- **`roamSupermemoSettingsChanged`** custom event: dispatched on every `set()` call, listened by `useSettings` to sync React state

## Roam Data Page Structure

```
roam/Supermemo (page)
├── data (heading 3)
│   └── ((cardUid))
│       ├── [[Date]] ⚪  ← baseline session (algorithm + interaction only, created on first practice)
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

**Reinsert (Forgot / LBL-Next):** `queueReinsert(uid, afterUid, offset)` directly modifies the `state.uids` snapshot. It removes the uid from its current position and re-inserts it `offset` positions after `afterUid`. This works on the snapshot layer, before display masks are applied. No separate patch type — reinsertion is a direct state mutation.

**Navigation after Forgot reinsert:** After reinsert, the card at `currentIndex` is already the next unreviewed card. `startIndex = currentIndex` (not `+1`) so `isCardCompletedToday` filtering correctly finds the next incomplete card without skipping.

**Optimistic updates must strip `isNew`:** `NewSession.isNew` leaks through spread into optimistic updates, causing `classifyCard` to still return `'new'` after practice. Always use `omitIsNew(data)` before merging `practiceResult` into `upsertLatestSessions`.

**Optimistic updates:** `gradeCard` action does optimistic facts update via dispatch → setShowAnswers reset → focus advance → async save to Roam. `changeConfig` action optimistically updates `facts.latestByUid` before the async Roam write.

**LBL Progressive Reveal:** `lineByLineRevealedCount` is local view-state (not mirrored). Moving down reveals one more line; moving up hides all lines below current. ▲/▼ navigation buttons are available in answer-hidden state for LBL cards.

**Child algorithm:** `getSessionAlgorithm(childSession, fallbackAlgorithm)` — uses the child's own session algorithm if present; otherwise falls back to the provided fallback. LBL children pass the parent's algorithm as fallback; normal cards use `DEFAULT_REVIEW_CONFIG.algorithm`.

## Pitfalls

- **Build:** `library.export: 'default'` in webpack standalone config must not be removed (Roam loads via `<script>`).
- **Filename conflict:** Do NOT name a roam/js script `extension.js` — Roam reserves this name for Extension Settings. The standalone output is named `standalone.js` for this reason.
- **No runtime backward compat.** Legacy data formats are not supported — only the current unified data format is used.
- **`resolveBaseForCalculation`** must be called before scheduling math on same-day re-reviews, or intervals inflate.
- **`hasCloze` is derived from block data** (children or `{...}` in text), not from DOM. Do not add a useState + useEffect for it — the `init=true` pattern was replaced with pure derivation.
- **`setShowAnswers(false)` MUST precede `currentIndex` advance** in `reviewUnit`. Reordering them causes the wrong card's showAnswers override to be reset when keyboard shortcuts fire grading (Blueprint's global event listeners are outside React's batch context), breaking showAnswers for reinserted Forgot cards.
- **Child blocks must NOT receive `interaction:: LBL`.** When `onSelectAlgorithm` fires for a child block, do NOT pass the parent's `interaction` — children are always NORMAL. The `updateReviewConfig` call for children omits `interaction` to prevent this leak.
- **Baseline session on first practice.** `savePracticeData` creates a ⚪ baseline block (algorithm + interaction only) before the first real session. Without it, undoing first practice physically deletes the only session, causing the card to revert to `NewSession` with default PROGRESSIVE algorithm — losing its original identity.
- **`isNew` leaks through spread.** `NewSession` has an `isNew: true` field. When spread into optimistic updates, `practiceResult` (type `Session`) doesn't contain `isNew` so it can't override it. Always `omitIsNew()` before merging.
- **Standalone output:** The `standalone.js` bundle also gets the `@blueprintjs` externals — ensure CDN script tags include Blueprint for roam/js users.
- **React 17:** Project uses React 17 + Blueprint 3.x. Do not upgrade without verifying `@blueprintjs/select` v3 compatibility.
- **No new Context providers.** All review state must flow through `ReviewStoreProvider`. If you're tempted to create a new Context, add the data to `ReviewState` instead.
- **`selectCurrentCardData` must NOT filter by `nextDueDate`.** This selector returns `LatestSessionRecord` (both `Session` and `NewSession`). Adding `'nextDueDate' in record` back will silently break new cards: algorithm switches revert to default, grading buttons disappear, `changeConfig` has no visible effect. New cards need this selector to return their record so the selector chain can read `algorithm`/`interaction` from state.
