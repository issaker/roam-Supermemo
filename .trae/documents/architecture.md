# Architecture — First Principles

The queue is an immutable snapshot, not a computation. Built once per session, modified by reinsert and filtered by display masks. Persisted to `localStorage` so page refreshes resume where you left off.

## Three-Layer Queue

```
Pipeline (queries/)          → 2-step: classifyAllCards → allocateDailyCards, computes TagCardSets from Roam data
Queue   (review-runtime/)    → state.uids snapshot + reinsert + mask filtering, session-stable
Runtime (review-runtime/)    → facts + viewState + queue, coordinates everything

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

## LBL Container (Mini-Deck)

The parent block is a **container**, not a card. It stores only:
- `algorithm`, `interaction` (configuration)
- `nextDueDate` (derived from children: `deriveParentNextDueDateFromChildSessions`)

Child blocks are the **real cards**. Each has its own independent `Session` with full scheduling state. Children can have different algorithms.

**Mini-Deck Classification Rule**: LBL decks are classified from their children's collective state via `classifyCard` (which wraps `classifyLblDeck` for LBL), never from the parent's own `nextDueDate` or `dateCreated`.

| Classification | Normal Card | LBL Deck (from children) |
|---------------|-------------|--------------------------|
| **completedUids** | `dateCreated is today && isSessionMastered` | All children mastered AND ≥1 child graded today |
| **dueUids** | `!isNew && isSessionDue` | Any child due or has no session |
| **newUids** | `no session || (isNew && !nextDueDate)` | All children have no session |

## Inviolable Rules

1. **Card is the atom.** One block + one session. It doesn't know which queue it sits in.
2. **LBL parent is a Mini-Deck, classified from children.** Only child blocks are real cards. The parent's `nextDueDate` is always derived from children at grading time. The pipeline classifies LBL decks from children's collective state (`classifyCard` → `classifyLblDeck`), never from the parent's `dateCreated`.
3. **One kind of card rendering.** `activeCard = useCardBlock(activeUid, activeSession)`. Same hook, same pipeline.
4. **One facts store, one view state.** `facts.latestByUid` holds every session. `viewState` holds position. Everything else is derived.
5. **Queue is snapshot, not computation.** Built once per session (date + tag + settings), never recomputed. Insertion changes go through `reinsert` on the snapshot. Display filtering (quota mask + blacklist mask) is a pure read that never modifies the snapshot. The snapshot is persisted to `localStorage` (key: `roam-memo:queue:{queueId}`); stale entries from other days are auto-cleaned on mount.

## Runtime (`src/review-runtime/`)

| Module | Role |
|--------|------|
| `types.ts` | `SessionFacts`, `ViewState` |
| `selectors.ts` | `deriveChildSessionMap` |
| `useReviewRuntime.ts` | Coordinator: composes `useSessionFacts` + `useReviewOperation` + `useQueue`. Manages `viewState`, navigation, and repositioning. |
| `useSessionFacts.ts` | Facts state management: `SessionFacts`, `upsertLatestSessions`, `setPendingState`, `ensureLatestSessions`. |
| `useReviewOperation.ts` | Review operations: `reviewUnit` + `updateReviewConfigAction`. Receives queue and navigation ops via dependency injection. |
| `reviewLogic.ts` | Pure business logic: `omitIsNew`, `mergeSourceIntoFacts`, `isCardCompletedToday`, `calculateChildReview`, `calculateNormalReview`, `resolveNextLblNavigation`. |
| `queue/types.ts` | `CardSet` type (due/new/completed UID arrays + lblMeta) |
| `queue/useQueue.ts` | Hook: manages state.uids snapshot + reinsert insertion layer + quota/blacklist mask filtering. Persists snapshot to localStorage for refresh resilience. |

## Key Modules

| Path | Role |
|------|------|
| `hooks/useCardBlock.ts` | Single card pipeline: block info, cloze guard, showAnswers. Shared by normal & LBL. |
| `hooks/useLineByLineReview.ts` | LBL Y-axis: child positioning, progressive reveal. Uses `deriveLblSubQueue`. Grading delegated to `reviewUnit`. |
| `hooks/useCurrentCardData.tsx` | `currentCardData` = `latestSession` alias. Optimistic `cardMeta` for config changes. |
| `hooks/usePracticeData.tsx` | Fetches practice data from Roam. No freezing — queue stability is handled by `useQueue`. |
| `models/session.ts` | Session model, scheduling algorithms, `interaction` (NORMAL/LBL), `classifyCard` (unified Normal + LBL classification). |
| `models/practice.ts` | `TagCardSet/TagCardSets` types, queue strategies: `sortNormalDueCardUids` (urgency), `deriveLblSubQueue` (single LBL sub-queue derivation point). |
| `queries/data.ts` | 2-step pipeline: `classifyAllCards` → `allocateDailyCards`. Roam page read/write, session parsing. |
| `queries/today.ts` | `classifyAllCards`: single-pass card classification → `TagCardSets`. |
| `queries/dataProcessing.ts` | Session parsing, `allocateDailyCards` (proportional daily limit allocation). |
| `practice.ts` | Pure scheduling math: SM2 / Progressive / Fixed Time. |

## Data Model

All data on a Roam page (default `roam/Supermemo`). Single session-block architecture:

```
roam/Supermemo
└── data
    └── ((cardUid))
        ├── [[Date]] ⚪  ← baseline session (algorithm + interaction only, created on first practice)
        ├── [[Date]] 🟢  ← latest session = SINGLE SOURCE OF TRUTH
        │   ├── algorithm:: SM2
        │   ├── interaction:: LBL
        │   ├── nextDueDate:: [[Date]]
        │   └── sm2_grade:: 5, sm2_eFactor:: 2.5, ...
        └── [[Date]] 🔴  ← same-day Forgot (preserved)
```

- Latest session block is the source of truth. `savePracticeData` always creates new blocks.
- Baseline session (⚪): created on first practice with only `algorithm` + `interaction`. Serves as the rollback point when undoing first practice — ensures the card's original identity is preserved.
- Field naming: `{owner}_{purpose}` (`sm2_*`, `progressive_*`, `fixed_*`).
- Each algorithm writes only its own fields; switching never loses data.
- LBL children have independent sessions; parent aggregates `nextDueDate`.

## SchedulingAlgorithm × InteractionStyle

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

## Key Pitfalls

### ⚠️ Build: Do NOT remove `library.export: 'default'`
Roam loads via `<script>`. Missing default export → `Uncaught SyntaxError`.

### No runtime backward compatibility
`resolveReviewConfig` returns PROGRESSIVE for unrecognized values. Legacy formats are not supported — only the current unified data format is used.

### Why mirrored state is forbidden

Every persistent review bug comes from state duplication. The snapshot + reinsert + mask model eliminates the need for mirrored state: the snapshot is the single source of truth for queue ordering, reinsert is the single source of truth for card repositioning, and masks are the single source of truth for display visibility.

### Reinsert works on the snapshot, before masks

`reinsert(uid, afterUid, offset)` directly modifies the `state.uids` array — it works on the full snapshot before any display filtering. This means reinserted cards respect their new position in the snapshot regardless of which cards are currently visible through masks. The mask layers (quota + blacklist) are always applied after reinsertion, as the final display step.

### After Forgot reinsert, current index already holds the next card

When a "Forgot" card is reinserted N positions later, the card at `currentIndex` is already the next unreviewed card. Navigation after reinsert uses `startIndex = currentIndex` (not `currentIndex + 1`) so `isCardCompletedToday` filtering correctly finds the next incomplete card without skipping.

### `resolveBaseForCalculation` — same-day re-scoring
Prevents interval inflation (Good→Perfect stacking). Three rules: (1) non-same-day → use as-is, (2) same-day Forgot → use as-is, (3) same-day non-Forgot → rewind to `baseSessionData`.

## Source Tree

```
src/
├── practice.ts              # SM2 / Progressive / Fixed Time math
├── models/
│   ├── session.ts           # Session, algorithms, interaction, classifyCard
│   └── practice.ts          # TagCardSet/TagCardSets types, queue strategies (urgency sort, deriveLblSubQueue)
├── review-runtime/
│   ├── types.ts             # SessionFacts, ViewState
│   ├── selectors.ts         # deriveChildSessionMap
│   ├── reviewLogic.ts       # Pure business logic (testable without React)
│   ├── useSessionFacts.ts   # Facts state management hook
│   ├── useReviewOperation.ts # Review operations hook (reviewUnit, updateReviewConfigAction)
│   ├── useReviewRuntime.ts  # Coordinator hook (composes sub-hooks)
│   └── queue/
│       ├── types.ts         # CardSet type
│       └── useQueue.ts      # Queue hook: snapshot + reinsert + mask
├── hooks/
│   ├── useCardBlock.ts      # Card pipeline (normal & LBL)
│   ├── useCurrentCardData.tsx
│   ├── useLineByLineReview.ts  # LBL Y-axis navigation
│   ├── usePracticeData.tsx     # Practice data fetch (no freezing)
│   ├── useSettings.ts       # Single source of truth for settings
│   ├── useTags.tsx          # Deck tag list from deckConfigs
│   ├── useCloze.tsx         # {} cloze deletion rendering
│   └── ...
├── queries/                 # data.ts, today.ts, save.ts, settings.ts, dataProcessing.ts
├── components/
│   ├── overlay/             # PracticeOverlay, Header, Footer, CardBlock, LineByLineView
│   ├── DeckConfigsTable.tsx # Table-based deck management UI
│   ├── SettingsForm.tsx     # Settings form with all options
│   ├── SidePanelWidget.tsx  # Sidebar review entry point
├── contexts/                # PracticeSessionContext, AlgorithmContext
└── utils/                   # date, string, dom, async, deckConfig, deckWeight
```

## Development

```bash
nvm use            # Node 18 (reads .nvmrc)
npm ci
npm run dev        # watch & rebuild
npm run build      # production → ./extension.js + ./standalone.js
npm run check      # lint + typecheck + test
```
