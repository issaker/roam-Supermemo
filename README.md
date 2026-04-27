# Memo - Spaced Repetition for Roam

A spaced repetition plugin for [Roam Research](https://roamresearch.com), supporting three scheduling algorithms: SM2, Progressive, and Fixed Time.

![Demo Preview](https://user-images.githubusercontent.com/1279335/189250105-656e6ba3-7703-46e6-bc71-ee8c5f3e39ab.gif)

## Quick Start

### Installation

This is a modified version of the original Memo plugin. Load it using the `{{[[roam/js]]}}` block on any page in your Roam graph:

````
- {{[[roam/js]]}}
    - ```javascript
      if (!window.roamMemoLoaded) {
        window.roamMemoLoaded = true;
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/issaker/roam-memo-Supermemo@main/extension.js';
        script.onload = function() {
          if (window.RoamMemo && window.RoamMemo.onload) {
            window.RoamMemo.onload({ extensionAPI: window.roamAlphaAPI });
          }
        };
        document.head.appendChild(script);
      }
      ```
````

### Basic Usage

1. Tag any block you wish to memorize with `#memo` (or your configured tag)
2. Click "Review" in the sidebar to launch
3. Start reviewing — child blocks are treated as answers (initially hidden, click "Show Answer" to reveal)

### Keyboard Shortcuts

| Action | Shortcut | Notes |
|--------|----------|-------|
| Show answer | `space` | Before answer is shown |
| Perfect | `space` | SM2 only, after answer shown |
| Forgot | `f` | SM2 only |
| Hard | `h` | SM2 only |
| Good | `g` | SM2 only |
| Skip | `s` / `→` | |
| Previous card | `←` | |
| Previous line | `↑` | LBL mode only |
| Next line | `↓` | LBL mode only |
| Breadcrumbs | `b` | |
| Close memo | `esc` | |
| Edit interval | `e` | Fixed Time only |

Command Palette: Type "Memo: Start Review Session" (`Cmd+P` / `Ctrl+P`)

## Features

### Multi Deck Support
Enter comma-separated tags in "Tag Pages" to create multiple decks. Supports quoted tags containing commas (e.g., `"french exam, fun facts"`).

### DailyNote Deck
Aggregates all top-level blocks from daily journal pages into a review deck. Enabled by default; toggle via "Enable DailyNote Deck" in Settings.

### Text Masking (Cloze)
Hide text for recall practice using braces: `{hide me}`. Masked with background color, revealed on answer.

### Daily Limits
Set a daily review limit in settings. ~25% of reviewed cards are new; round-robin distribution across decks for fairness.

### Shuffle Cards
Enable to randomize card order. Default: due cards sorted by urgency (most overdue → lowest eFactor → fewest repetitions). Fixed Time cards use default eFactor (2.5) for moderate queue priority.

### Swap Q/A (Answers First)
Toggle per-deck via the tag settings menu ("Swap Q/A"). Reverses card presentation — shows answers first, click to reveal the question.

### Cram Mode
After finishing due cards, continue reviewing all cards without affecting scheduling.

### History Data Cleanup
Clean up old session history data. Configure how many recent session blocks to keep per card (default: 3).

### Breadcrumbs
Show the block's page hierarchy for context. Toggle with `b` key. Preference persisted across sessions.

### Mode Indicator Badge
Color-coded badges in the header bar for instant visual identification:
- **Algorithm badge**: SM2 (green) / Progressive (orange) / Fixed Time (blue)
- **Interaction badge**: LBL (when active)
- Dialog border color matches the algorithm (toggle via "Show Review Mode Borders")

## Architecture

### Core Model

Memo is a learning system built around cards and session data.

- `NORMAL` is the primary queue: cards are sorted by urgency and reviewed one by one.
- `LBL` is not a separate learning system. It is a primary card rendered as an ordered child-card queue.
- Every real learning unit has independent session data and can use any of the three algorithms.
- The only semantic difference between `NORMAL` and `LBL` is queue strategy:
  `NORMAL` sorts cards by urgency, while `LBL` scans child blocks top-to-bottom and jumps to the next due line.

That gives the codebase one scheduling engine, two queue strategies, and one stable session-data format.

### SchedulingAlgorithm × InteractionStyle

Each top-level review card independently chooses:

| Dimension | Purpose | Values |
|-----------|---------|--------|
| **Scheduling Algorithm** | Interval calculation | `PROGRESSIVE`, `SM2`, `FIXED_TIME` |
| **Interaction Style** | Card presentation | `NORMAL`, `LBL` |

All definitions are in `src/models/session.ts`.

#### Scheduling Algorithms

| Algorithm | Description | Border Color |
|-----------|-------------|-------------|
| `PROGRESSIVE` | Exponential curve: 2→6→12→24→48→96 days (reading card) | Orange |
| `SM2` | Modified SuperMemo 2 — adaptive intervals based on grading (Forgot/Hard/Good/Perfect) | Green |
| `FIXED_TIME` | User-defined interval via number + time unit (days/weeks/months/years) | Blue |

**SM2 details**: `interval × eFactor × (grade/5)`. Grade mapping: Forgot(0), Hard(2), Good(4), Perfect(5). Grade 0 → review again today; Grades 1-2 → review tomorrow. E-Factor minimum: 1.3.

**Progressive**: Standalone exponential curve, independent of SM2. Only modifies `progressive_repetitions`, never pollutes SM2 fields. Default algorithm for new cards.

**Fixed Time**: User manually sets the review interval (number + time unit). No algorithm state — just direct nextDueDate calculation from user input. Configurable per card via interval editor (`E` key).

#### Interaction Styles

| Style | Description |
|-------|-------------|
| `NORMAL` | Standard primary queue card |
| `LBL` | Primary queue card rendered as an ordered child-card queue |

**LBL button bars are identical to Normal mode** because LBL child blocks are still ordinary learning units:

| Algorithm | Normal Button Bar | LBL Button Bar |
|-----------|-------------------|----------------|
| SM2 | ShowAnswer → Forgot / Hard / Good / Perfect | ShowAnswer → Forgot / Hard / Good / Perfect |
| Progressive | Review + Next | Review + Next |
| Fixed Time | Change Interval + Next | Change Interval + Next |

> LBL child blocks are independent cards arranged in reading order. They do not own an interaction mode.

> The `READ` (Incremental Read) interaction has been removed — its functionality is now covered by `LBL + Progressive/Fixed Time`.

#### Dynamic Switching
Each card's `algorithm` and `interaction` are stored in the latest session block. Changes take effect immediately on card navigation via two independent selectors (bottom-right of grading area).

#### Queue Strategies

Memo has two queue layers with different responsibilities:

| Dimension | Primary Queue | Secondary Queue (LBL) |
|-----------|--------------|----------------------|
| Navigation | ◀ / ▶ (← / →) | ▲ / ▼ (↑ / ↓) |
| Scope | Cards in `cardQueue` | Child blocks in `childUidsList` |
| Ordering rule | Urgency sort | Source block order |
| Completion | Advances to next card | Advances to next due child block |

**Key principles**:
- The primary queue (`cardQueue` + `currentIndex`) manages navigation between cards via ◀/▶
- The secondary queue (`childUidsList` + `lineByLineCurrentChildIndex`) manages navigation between child blocks via ▲/▼
- `NORMAL` queue policy lives in `src/models/practice.ts -> sortNormalDueCardUids`
- `LBL` queue policy lives in `src/models/practice.ts -> getLblQueueState`
- Child blocks keep independent session records; the parent card only contributes `interaction` and the aggregated `nextDueDate`
- A child block without session data is treated as due
- LBL never reorders child blocks; it only scans forward to the next due line
- Navigating up/down only changes the viewing position; grading still drives learning progression

##### Interaction Mode Scope

Interaction mode (Normal/LBL) is a **parent-level property only**:

- Child blocks are treated as `NORMAL` learning units and do not own an interaction mode
- `InteractionSelector` always displays the parent card's interaction, regardless of which child line is active
- Switching interaction mode operates on the parent card directly
- A child block rendered on its own behaves like any other normal card

##### SM2 ShowAnswer in LBL Mode

SM2's ShowAnswer behavior in LBL mode is **identical to Normal cards**:

1. **ShowAnswer trigger**: When a child block has sub-content (`hasBlockChildren`) or cloze (`hasCloze`), the ShowAnswer button is displayed
2. **No ShowAnswer**: When a child block has no sub-content and no cloze, grading buttons are displayed directly
3. **Switching to SM2**: The user stays at the current line — no back-navigation or hiding occurs
4. **After grading**: Auto-advances to the next due child block (equivalent to Normal card's page turn)

> Note for future maintainers: queue strategy should never change scheduling semantics. New algorithms should plug into the same session model and button-flow rules.

### Data Model

All practice data is stored on a Roam page (default: `roam/memo`). Each card's data follows a **unified session-block architecture** — all fields are stored in session records, with no separate meta block.

```
roam/memo (page)
├── data (heading block)
│   ├── ((cardUid))
│   │   ├── [[April 14th, 2026]] 🟢    ← Latest session (SINGLE SOURCE OF TRUTH)
│   │   │   ├── algorithm:: SM2
│   │   │   ├── interaction:: LBL
│   │   │   ├── nextDueDate:: [[April 15th, 2026]]
│   │   │   ├── sm2_grade:: 5
│   │   │   ├── sm2_eFactor:: 2.5
│   │   │   ├── sm2_repetitions:: 3
│   │   │   ├── sm2_interval:: 6
│   │   │   ├── progressive_repetitions:: 2
│   │   │   ├── progressive_interval:: 6
│   │   │   ├── fixed_multiplier:: 3
│   │   │   └── fixed_unit:: days
│   │   ├── [[April 14th, 2026]] 🔴    ← Same-day Forgot session (preserved for SM2)
│   │   └── [[April 13th, 2026]] 🔵    ← Older session
│   └── ...
├── cache (heading block)
└── settings (heading block)
```

**Key principles**:
- The latest session block is the single source of truth
- Same-day Forgot sessions are preserved (not overwritten) so the SM2 algorithm can account for the Forgot in subsequent calculations
- Field naming follows `{owner}_{purpose}` convention: `sm2_*`, `progressive_*`, `fixed_*`
- Each algorithm only modifies its OWN fields; other fields are inherited unchanged → switching algorithms never loses data
- LBL child blocks have independent sessions; parent cards only aggregate child due state
- `progressive_interval` is the calculated interval (2→6→12→24→48→96 days) based on `progressive_repetitions`
- `fixed_multiplier` + `fixed_unit` store the user's interval choice for Fixed Time cards

### Data Flow

At runtime the system is intentionally split into four layers:

1. `src/practice.ts`
   Pure scheduling math for SM2 / Progressive / Fixed Time.
2. `src/models/session.ts`
   Shared learning semantics: due/mastered checks, child due detection, parent due aggregation, and `resolveBaseForCalculation` (unified same-day re-scoring logic).
3. `src/models/practice.ts`
   Queue strategies: primary queue urgency sorting and LBL sequential scanning.
4. UI + queries
   `queries/*.ts` read/write session blocks, while `PracticeOverlay` and `useLineByLineReview` render and execute queue state.

If a bug is about "which card or line should appear next", fix the strategy/model layer first, not the component layer.

### Settings Architecture

Settings use a **single-source-of-truth** design:

| Layer | Role | When Written |
|-------|------|-------------|
| `extensionAPI.settings` | **Primary** | On "Apply & Close" |
| Roam data page (`roam/memo`) | **Backup** | Debounced 5s after last change |

**Key behaviors**:
- **Apply & Close**: Saves settings, closes dialog and overlay. Must manually reopen for full effect.
- **Close (discard)**: Closes without saving.
- **roam/js mode**: In-memory overlay wraps `extensionAPI.settings`; data page backup restores settings on cold start.
- **Unmount flush**: Pending debounced syncs are flushed immediately when overlay closes.

## Key Design Decisions & Pitfalls

### Why Algorithm × Interaction instead of N ReviewModes?
The old `ReviewModes` enum encoded both scheduling and interaction in each value (e.g., `SPACED_INTERVAL_LBL` = SM2 + LBL). This was **not orthogonal** — adding one algorithm required N new enum values. The new two-dimensional design separates concerns completely; adding either dimension is independent.

### Why merge four Fixed modes into Fixed Time?
The previous design had four separate algorithms (`FIXED_DAYS`, `FIXED_WEEKS`, `FIXED_MONTHS`, `FIXED_YEARS`) that differed only in their time unit. This was redundant — the unit is just a user preference, not a fundamentally different algorithm. Merging them into `FIXED_TIME` with a `fixed_unit` dropdown simplifies the algorithm list from 6 to 3, reduces UI clutter, and gives users more flexibility to change the time unit on the fly.

### Why data migration instead of runtime backward compatibility?
The old system read `reviewMode::` fields and decomposed them at runtime on every card load — a permanent compatibility tax. The new approach uses **one-time data migration** that converts `reviewMode::` to `algorithm::` + `interaction::` at the data level, simplifying the loading pipeline permanently.

**No backward compatibility policy**: The plugin does **not** do runtime backward compatibility. `resolveReviewConfig` treats unrecognized algorithm values as invalid and falls back to the default (PROGRESSIVE). Old data MUST be migrated via the Data Migration panel. This is an intentional design decision — permanent backward compatibility creates technical debt that accumulates over time, making the codebase harder to maintain and more bug-prone. Data migration is the single path forward.

### Why merge READ into LBL?
`READ` was functionally identical to `LBL + Progressive`. Since the algorithm already determines LBL behavior (SM2 → grading buttons, Progressive/Fixed Time → Next button), a separate READ type was redundant. Removing it reduces the combination space with zero semantic loss.

### Why treat LBL as a queue strategy instead of a separate card type?
Because the system's purpose is card learning, not mode-specific behavior. The learning record belongs to the card or child block itself; `LBL` only says "render this primary card as an ordered child queue". This keeps scheduling, storage, and algorithm switching identical across the whole system.

### Why the `{owner}_{purpose}` field naming convention?
Old names (`repetitions`, `interval`, `eFactor`) were ambiguous — they didn't indicate which algorithm owned them. New names (`sm2_repetitions`, `progressive_interval`) make field ownership explicit, reducing cross-algorithm pollution bugs.

### Why undo instead of overwrite for same-day re-learning?
Previously, re-scoring a card on the same day would silently overwrite the existing session block with a 2.5-second toast reminder. This violated user autonomy — the software made the overwrite decision, not the user.

The new design replaces this with an explicit "Undo Learning" button:
- Cards with `nextDueDate > now` (learned/mastered) show "Undo Learning (SM2/Progressive/FixedTime)" instead of grading buttons
- Users must explicitly undo before re-learning, giving them full control
- `savePracticeData` always creates a new session block (no overwrite logic)
- `undoLatestSession` deletes the latest session block, reverting to the previous state
- Learning status is unified: all cards (Normal + LBL children) use `isSessionMastered` (i.e., `nextDueDate > now`) as the judgment standard
- The `OverwriteReminder` component and `isReScoring`/`isChildReScoring` checks have been removed

### Why resolveBaseForCalculation?
Same-day re-scoring requires "rewinding" to the pre-re-score state to prevent interval inflation (e.g., Good→Perfect stacking intervals). Previously, this logic was scattered across 5 locations with subtly different conditions. `resolveBaseForCalculation` unifies this into 3 clear rules: (1) non-same-day → use as-is, (2) same-day Forgot → use as-is (Forgot is the new baseline), (3) same-day non-Forgot → use `baseSessionData` (rewind to Forgot or previous day). This eliminates the `baseSessionDataMap` → `baseCardData` → `effectiveBaseCardData` three-layer chain and reduces code by ~60 lines.

### Why undo instead of overwrite?
Same-day re-scoring previously used a "silent overwrite + toast reminder" pattern. This had three problems: (1) the software decided to overwrite, not the user, (2) the 2.5-second toast was easy to miss, (3) the overwrite logic (same-day dedup + Forgot preservation + field backfill) was the most complex part of `savePracticeData`. The undo pattern simplifies all three: the user explicitly chooses to undo, the "Undo Learning" button is always visible, and `savePracticeData` simply always creates a new block.

Additionally, the learning status judgment is now unified: `isLearned` uses `isSessionMastered` (nextDueDate > now) instead of `isSameDay(dateCreated) + sm2_grade !== 0`. This eliminates the LBL special-case in `calculateCompletedTodayCounts` and correctly handles Forgot cards (which have nextDueDate <= now and are therefore not "learned").

### ⚠️ Build Pitfall: Do NOT remove `library.export: 'default'`
Roam loads plugins via `<script>` tag. The UMD wrapper needs proper default export handling. Removing this causes `Uncaught SyntaxError: Unexpected token 'export'` and silent plugin failure.

## Data Migration

After upgrading to the `SchedulingAlgorithm × InteractionStyle` architecture, run the Data Migration tool once:

1. Open Memo overlay → gear icon → **Settings**
2. Navigate to **Data Migration** → Click migration button

**What it does**: `reviewMode::` → `algorithm::` + `interaction::`, `cardType::` → `reviewMode::`, meta block merge, `lineByLineReview:: Y` → LBL, `interaction:: READ` → `LBL`, field renaming to `{owner}_{purpose}` convention, duplicate/obsolete field cleanup, `FIXED_DAYS/WEEKS/MONTHS/YEARS` → `FIXED_TIME`.

**Safe to run multiple times** — already-migrated cards are skipped.

## Development

```bash
nvm use            # optional, reads .nvmrc (Node 18)
npm ci
npm run dev          # Development mode (watch & rebuild on change)
npm run build        # Production build → ./extension.js
npm run lint         # Run ESLint on all source files
npm run typecheck    # TypeScript type checking
npm run test         # Run tests
npm run check        # Local CI parity: lint + typecheck + test
```

### Local Dev Notes

- Node `18+` is required for local development and matches CI.
- No `.env` file is required for this plugin.
- Shared editor defaults live in `.vscode/settings.json` and `.vscode/extensions.json`.
- CI uses `npm ci`, so local dependency troubleshooting should start with `rm -rf node_modules && npm ci`.

### Project Structure

```
src/
├── extension.tsx          # Plugin entry point (onload/onunload)
├── app.tsx                # Root React component
├── practice.ts            # SM2 + Progressive + Fixed Time algorithms
├── constants.ts           # Shared constants
├── models/
│   ├── session.ts         # Session, CardMeta, SchedulingAlgorithm, FixedTimeUnit, InteractionStyle
│   └── practice.ts        # Queue strategies for NORMAL and LBL
├── queries/
│   ├── data.ts            # Core data layer (session block parsing & merging)
│   ├── today.ts           # Today's review calculation (due/new/completed)
│   ├── save.ts            # Write practice data to Roam session blocks
│   ├── cache.ts           # Per-tag cache
│   ├── settings.ts        # Settings page persistence
│   └── utils.ts           # Roam API query helpers
├── hooks/
│   ├── useSettings.ts     # Settings single-source-of-truth
│   ├── usePracticeData.tsx # Practice data fetching
│   ├── useCurrentCardData.tsx # Active card data with latest-session resolution
│   ├── useLineByLineReview.ts # Secondary queue execution for LBL
│   └── ...                # Other UI interaction hooks
├── components/overlay/
│   ├── PracticeOverlay.tsx  # Main review overlay
│   ├── Header.tsx / Footer.tsx / CardBlock.tsx / LineByLineView.tsx
│   ├── SettingsDialog.tsx   # Settings + HistoryCleanup + Data Migration
│   └── ...
├── contexts/
│   └── PracticeSessionContext.tsx
├── utils/                  # date, string, dom, async, mediaQueries, zIndexFix
└── theme.ts               # Theme color definitions (SM2=green, Progressive=orange, FixedTime=blue)
```

## Privacy & Security

- All practice data is stored in your Roam graph on the configured data page
- Memo does not send practice/session payloads to any external server
- The legacy Roam-SR remote bulk import path has been removed

## Bug Reports & Feature Requests

Create issues at https://github.com/issaker/roam-memo-Supermemo

---

Original author: [digitalmaster](https://github.com/digitalmaster/roam-memo)
