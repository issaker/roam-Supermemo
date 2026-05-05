# Supermemo - Spaced Repetition for Roam

A spaced repetition plugin for [Roam Research](https://roamresearch.com). Three algorithms: SM2, Progressive, Fixed Time.

![Demo Preview](https://user-images.githubusercontent.com/1279335/189250105-656e6ba3-7703-46e6-bc71-ee8c5f3e39ab.gif)

## Quick Start

### Install

**Option 1 — `roam/js`**: Paste into a `{{[[roam/js]]}}` block:
```javascript
if (!window.roamSupermemoLoaded) {
  window.roamSupermemoLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/issaker/roam-Supermemo@main/standalone.js';
  s.onload = () => window.RoamSupermemo?.onload({ extensionAPI: window.roamAlphaAPI });
  document.head.appendChild(s);
}
```

**Option 2 — Developer Extensions**: Point Roam at this repo; `extension.js` + `build.sh` handle the rest.

**Option 3 — Dev**: `npm run build`, load unpacked extension from repo root.

### Usage

1. Tag a block with `#memo` (or your custom deck tag)
2. Click "Review" in the sidebar, or use Command Palette (`Cmd/Ctrl+P` → "Memo: Start Review Session")
3. Review cards — press `Space` to show answer, then grade

**Normal mode**: child blocks are hidden answers, revealed on "Show Answer".
**Swap Q/A mode**: answers shown first, question hidden until "Show Answer".
**Line-by-Line (LBL) mode**: child blocks revealed one at a time top-to-bottom.

### Shortcuts

| Action | Key |
|--------|-----|
| Show Answer / Perfect (SM2) / Next (Progressive/Fixed) | `Space` |
| Forgot / Hard / Good (SM2 only) | `F` `H` `G` |
| Next card | `→` |
| Previous card | `←` |
| Previous / Next line (LBL) | `↑` `↓` |
| Edit interval (Fixed Time) | `E` |
| Toggle breadcrumbs | `B` |
| Close overlay | `Esc` |

### Settings

Open settings via the ⚙ gear icon in the review overlay header. Changes apply on "Apply & Restart".

**Tag Pages (Decks)**: Table-based deck management. Each deck has a name, Swap Q/A toggle, and Weight %. Add (+), remove (−), and reorder (↑↓) decks via action buttons. Weights auto-redistribute on change and always sum to 100%. Set a deck's weight to 0 to disable its review quota.

**DailyNote Deck**: Toggle via "Enable DailyNote Deck" checkbox. Aggregates all top-level blocks from your Daily Notes pages into a special deck (shown with 📅 icon in the deck selector).

**Daily Review Limit**: Number of cards per day (0 = unlimited). When set, each deck receives a proportional share based on its Weight %.

**Reinsert "Forgot" Cards After N Cards**: When you mark a card as "Forgot", it reappears N cards later. Set to 0 to disable.

**Reinsert "LBL Next" Cards After N Cards**: When you click "Next" on an LBL + Progressive/Fixed card, it reappears N cards later. Set to 0 to review all lines consecutively (like SM2 LBL mode).

**Data Page Title**: Roam page name for storing all plugin data (default: `roam/Supermemo`).

**Auto Collapse Blocks After Review**: Automatically collapse reviewed blocks on the Roam page. In LBL mode, only the current sub-block stays expanded.

**Show Review Mode Borders**: Color-coded dialog border per algorithm — green=SM2, orange=Progressive, blue=Fixed Time.

**Shuffle Cards**: OFF → due cards sorted by urgency (most overdue → hardest → least mature), new cards in reverse creation order. ON → all cards randomly shuffled.

**Right-to-Left (RTL) Enabled**: Enable RTL layout for Arabic, Hebrew, etc.

### In-Review Controls

**Algorithm Selector**: Dropdown in the footer to change the current card's algorithm on the fly (SM2 / Progressive / Fixed Time). Persists to the data page.

**Interaction Selector**: Dropdown in the footer to change the current card's interaction mode (Normal / Line by Line). Persists to the data page.

**Undo Learning**: When a card is already learned today, an "Undo Learning" button appears to reset its scheduling record.

**Cram**: After finishing all due cards, click "Continue Cramming" to review cards without affecting scheduling. A "Cramming" badge appears in the header.

**Breadcrumbs**: Toggle page hierarchy display via the 👁 eye icon in the header or the `B` key.

### Cloze Deletion

Use `{hide me}` curly braces to create cloze deletions. Text inside `{}` is masked when answers are hidden and revealed on "Show Answer". Roam's native `^^highlight^^` is NOT treated as cloze.

### Data Migration

Settings → Data Migration panel. Converts `reviewMode::` → `algorithm::` + `interaction::`, renames legacy field names to `{owner}_{purpose}` convention, merges meta blocks into sessions, migrates `lbl_progress` to independent child block sessions, and converts `FIXED_DAYS/WEEKS/MONTHS/YEARS` → `FIXED_TIME`. Safe to run multiple times.

## Architecture — First Principles

The queue is an immutable snapshot, not a computation. Built once per session, modified by reinsert and filtered by display masks.

### Three-Layer Queue

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

### LBL Container (Mini-Deck)

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

### Inviolable Rules

1. **Card is the atom.** One block + one session. It doesn't know which queue it sits in.
2. **LBL parent is a Mini-Deck, classified from children.** Only child blocks are real cards. The parent's `nextDueDate` is always derived from children at grading time. The pipeline classifies LBL decks from children's collective state (`classifyCard` → `classifyLblDeck`), never from the parent's `dateCreated`.
3. **One kind of card rendering.** `activeCard = useCardBlock(activeUid, activeSession)`. Same hook, same pipeline.
4. **One facts store, one view state.** `facts.latestByUid` holds every session. `viewState` holds position. Everything else is derived.
5. **Queue is snapshot, not computation.** Built once per session (date + tag + settings), never recomputed. Insertion changes go through `reinsert` on the snapshot. Display filtering (quota mask + blacklist mask) is a pure read that never modifies the snapshot.

### Runtime (`src/review-runtime/`)

| Module | Role |
|--------|------|
| `types.ts` | `SessionFacts`, `ViewState` |
| `selectors.ts` | `deriveChildSessionMap` |
| `useReviewRuntime.ts` | Unified hook: facts + view state + `reviewUnit` + `updateReviewConfigAction` |
| `queue/types.ts` | `CardSet` type (due/new/completed UID arrays + lblMeta) |
| `queue/useQueue.ts` | Hook: manages state.uids snapshot + reinsert insertion layer + quota/blacklist mask filtering |

### Key Modules

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

### Data Model

All data on a Roam page (default `roam/Supermemo`). Single session-block architecture:

```
roam/Supermemo
└── data
    └── ((cardUid))
        ├── [[Date]] 🟢  ← latest session = SINGLE SOURCE OF TRUTH
        │   ├── algorithm:: SM2
        │   ├── interaction:: LBL
        │   ├── nextDueDate:: [[Date]]
        │   └── sm2_grade:: 5, sm2_eFactor:: 2.5, ...
        └── [[Date]] 🔴  ← same-day Forgot (preserved)
```

- Latest session block is the source of truth. `savePracticeData` always creates new blocks.
- Field naming: `{owner}_{purpose}` (`sm2_*`, `progressive_*`, `fixed_*`).
- Each algorithm writes only its own fields; switching never loses data.
- LBL children have independent sessions; parent aggregates `nextDueDate`.

### SchedulingAlgorithm × InteractionStyle

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
`resolveReviewConfig` returns PROGRESSIVE for unrecognized values. Old data MUST migrate via Data Migration panel. Permanent compat = technical debt.

### Why mirrored state is forbidden

Every persistent review bug comes from state duplication. The snapshot + reinsert + mask model eliminates the need for mirrored state: the snapshot is the single source of truth for queue ordering, reinsert is the single source of truth for card repositioning, and masks are the single source of truth for display visibility.

### Reinsert works on the snapshot, before masks

`reinsert(uid, afterUid, offset)` directly modifies the `state.uids` array — it works on the full snapshot before any display filtering. This means reinserted cards respect their new position in the snapshot regardless of which cards are currently visible through masks. The mask layers (quota + blacklist) are always applied after reinsertion, as the final display step.

### `resolveBaseForCalculation` — same-day re-scoring
Prevents interval inflation (Good→Perfect stacking). Three rules: (1) non-same-day → use as-is, (2) same-day Forgot → use as-is, (3) same-day non-Forgot → rewind to `baseSessionData`.

## Development

```bash
nvm use            # Node 18 (reads .nvmrc)
npm ci
npm run dev        # watch & rebuild
npm run build      # production → ./extension.js
npm run check      # lint + typecheck + test
```

```
src/
├── practice.ts              # SM2 / Progressive / Fixed Time math
├── models/
│   ├── session.ts           # Session, algorithms, interaction, classifyCard
│   └── practice.ts          # TagCardSet/TagCardSets types, queue strategies (urgency sort, deriveLblSubQueue)
├── review-runtime/
│   ├── types.ts             # SessionFacts, ViewState
│   ├── selectors.ts         # deriveChildSessionMap
│   ├── useReviewRuntime.ts  # Unified runtime hook
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
│   └── MigrateLegacyDataPanel.tsx
├── contexts/                # PracticeSessionContext, AlgorithmContext
└── utils/                   # date, string, dom, async, deckConfig, deckWeight
```

## Privacy

All data stored in your Roam graph. No external requests.
