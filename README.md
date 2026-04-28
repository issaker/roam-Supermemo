# Memo - Spaced Repetition for Roam

A spaced repetition plugin for [Roam Research](https://roamresearch.com). Three algorithms: SM2, Progressive, Fixed Time.

![Demo Preview](https://user-images.githubusercontent.com/1279335/189250105-656e6ba3-7703-46e6-bc71-ee8c5f3e39ab.gif)

## Quick Start

### Install

**Option 1 — `roam/js`**: Paste into a `{{[[roam/js]]}}` block:
```javascript
if (!window.roamMemoLoaded) {
  window.roamMemoLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/issaker/roam-memo-Supermemo@main/standalone.js';
  s.onload = () => window.RoamMemo?.onload({ extensionAPI: window.roamAlphaAPI });
  document.head.appendChild(s);
}
```

**Option 2 — Developer Extensions**: Point Roam at this repo; `extension.js` + `build.sh` handle the rest.

**Option 3 — Dev**: `npm run build`, load unpacked extension from repo root.

### Usage

1. Tag a block with `#memo` (or your tag)
2. Click "Review" in the sidebar
3. Review — child blocks are answers (hidden until "Show Answer")

### Shortcuts

| Action | Key |
|--------|-----|
| Show Answer / Perfect (SM2) | `Space` |
| Forgot / Hard / Good | `F` `H` `G` (SM2) |
| Skip / Next card | `S` / `→` |
| Previous card | `←` |
| Previous / Next line (LBL) | `↑` `↓` |
| Edit interval (Fixed Time) | `E` |
| Breadcrumbs | `B` |
| Close | `Esc` |

### Features

**Decks**: comma-separated tags in Settings. **DailyNote Deck**: review journal pages. **Cloze**: `{hide me}` braces. **Daily Limit**: cap reviews/day with round-robin distribution. **Shuffle**: randomize order. **Swap Q/A**: per-deck answer-first mode. **Cram**: review without scheduling after daily limit. **Breadcrumbs**: page hierarchy (`B` key). **Mode borders**: color-coded dialog border per algorithm.

## Architecture — First Principles

The system is TWO layers. No more.

```
┌─ Queue System (navigation only) ──────────────────────────┐
│                                                            │
│  X‑axis Primary Queue          Y‑axis LBL Queue            │
│  ◀ card A ▶ ◀ card B ▶         ▲ child 0                  │
│  ◀ LBL parent ▶ ◀ card C ▶     ├─ child 1  ← focused      │
│  (sorted by urgency)            ▼ child 2                  │
│                                 (sorted by doc order)       │
│  reviewUnit(action)  ←──  single grading entry point       │
│                                                            │
├─ Card System (rendering / interaction) ───────────────────┤
│                                                            │
│  activeUid = inLbl ? currentChildUid : currentCardRefUid     │
│  activeCard = useCardBlock(activeUid, facts.latestByUid[uid])│
│    One data source.  One hook.  One pipeline.                │
│  CardBlock  ←  same component, same props                  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Inviolable Rules

1. **Card is the atom.** A card is a Roam block + its session. It does not know which queue it sits in. Queue only determines navigation and ordering.
2. **LBL is a mini-deck.** An LBL parent is one X-axis entry containing an ordered Y-axis child list. Children learned top-to-bottom, skipping non-due. Parent `nextDueDate` = earliest child due date.
3. **There is only ONE kind of card.** `activeCard = useCardBlock(activeUid, activeSession)`. The same hook, same pipeline. The uid and session come from different sources depending on queue, but the card itself is identical.
4. **One facts store, one view state.** `facts.latestByUid` holds every session (normal + child). `viewState` holds `focusedPrimaryUid`, `focusedChildUid`, `revisitDirectives`. Everything else is derived.
5. **No mirrored state.** Never add `currentCardData`, `sessionOverrides`, `childSessionData`, `cardQueue`, `currentIndex` clones. Bugs come from state duplication, not missing conditionals.

### Runtime (`src/review-runtime/`)

| Module | Role |
|--------|------|
| `types.ts` | `SessionFacts`, `ViewState`, `DeckSnapshot` |
| `selectors.ts` | Pure derivation: `deriveDeckSnapshot`, `derivePrimaryQueueEntries`, `deriveFocusedPrimaryEntry` |
| `useReviewRuntime.ts` | Unified hook: facts + view state + `reviewUnit` + `undoLatestReview` + `updateReviewConfigAction` |

### Key Modules

| Path | Role |
|------|------|
| `hooks/useCardBlock.ts` | Single card pipeline: block info, cloze guard, showAnswers. Shared by normal & LBL. |
| `hooks/useLineByLineReview.ts` | LBL Y-axis: child positioning, progressive reveal. Grading delegated to `reviewUnit`. |
| `hooks/useCurrentCardData.tsx` | `currentCardData` = `latestSession` alias. Optimistic `cardMeta` for config changes. |
| `models/session.ts` | Session model, scheduling algorithms, `interaction` (NORMAL/LBL), `ReviewStatus`, `resolveBaseForCalculation`. |
| `models/practice.ts` | Queue strategies: `sortNormalDueCardUids` (urgency), `getLblQueueState` (doc order scan). |
| `queries/data.ts` | Roam page read/write, session parsing, `limitRemainingPracticeData`. |
| `queries/today.ts` | Due/new/completed calculation pipeline (mutable — target: pure derivation). |
| `practice.ts` | Pure scheduling math: SM2 / Progressive / Fixed Time. |

### Data Model

All data on a Roam page (default `roam/memo`). Single session-block architecture:

```
roam/memo
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
Every persistent review bug comes from state duplication:
- undo reverts data, but one mirror still shows old state
- child review updates child session, parent aggregate lags
- refresh rebuilds one queue, another local cursor points to stale context

Fix: one session per uid, one view state, everything else derived. Bias toward **removing** state, not adding sync patches.

### `resolveBaseForCalculation` — same-day re-scoring
Prevents interval inflation (Good→Perfect stacking). Three rules: (1) non-same-day → use as-is, (2) same-day Forgot → use as-is, (3) same-day non-Forgot → rewind to `baseSessionData`.

## Data Migration

After upgrading: Settings → Data Migration. Converts `reviewMode::` → `algorithm::` + `interaction::`, renames fields to `{owner}_{purpose}`, merges FIXED_* → FIXED_TIME. Safe to run multiple times.

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
│   ├── session.ts           # Session, algorithms, interaction, ReviewStatus
│   └── practice.ts          # Queue strategies (urgency sort, LBL scan)
├── review-runtime/
│   ├── types.ts / selectors.ts / useReviewRuntime.ts
├── hooks/
│   ├── useCardBlock.ts      # Card pipeline (normal & LBL)
│   ├── useCurrentCardData.tsx
│   ├── useLineByLineReview.ts  # LBL Y-axis navigation
│   └── ...
├── queries/                 # data.ts, today.ts, save.ts
├── components/overlay/      # PracticeOverlay, Header, Footer, CardBlock, LineByLineView
└── utils/                   # date, string, dom, async
```

## Privacy

All data stored in your Roam graph. No external requests.
