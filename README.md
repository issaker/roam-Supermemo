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

### SchedulingAlgorithm × InteractionStyle

The review system uses a **two-dimensional orthogonal architecture**. Each card is configured by independently choosing a **Scheduling Algorithm** (how intervals are calculated) and an **Interaction Style** (how the card is presented). These two dimensions are fully independent — any algorithm pairs with any interaction style.

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
| `NORMAL` | Standard card review — show question, reveal answer |
| `LBL` | Line-by-Line — per-child Q&A with independent scheduling |

**LBL behavior is determined by the algorithm**:
- **LBL + SM2**: Show parent, reveal children one at a time, grade each with SM2 buttons. "Forgot" reinserts card into queue.
- **LBL + Progressive/Fixed Time**: First unread child auto-revealed, click "Next" to advance with automatic reinsertion.

> The `READ` (Incremental Read) interaction has been removed — its functionality is now covered by `LBL + Progressive/Fixed Time`.

#### Dynamic Switching
Each card's `algorithm` and `interaction` are stored in the latest session block. Changes take effect immediately on card navigation via two independent selectors (bottom-right of grading area).

#### LBL Dual-Queue Architecture

LBL (Line-by-Line) mode implements a **dual-queue navigation system** — a secondary queue nested within the primary card queue:

| Dimension | Primary Queue | Secondary Queue (LBL) |
|-----------|--------------|----------------------|
| Navigation | ◀ / ▶ (← / →) | ▲ / ▼ (↑ / ↓) |
| Scope | Cards in `cardQueue` | Child blocks in `childUidsList` |
| Grading | No grading on navigation | No grading on navigation |
| Completion | Advances to next card | Advances to next due child block |

**Key principles**:
- The primary queue (`cardQueue` + `currentIndex`) manages navigation between cards via ◀/▶
- The secondary queue (`childUidsList` + `lineByLineCurrentChildIndex`) manages navigation between child blocks via ▲/▼
- The two navigation systems are fully independent and parallel
- Parent block determines LBL mode activation; its algorithm serves as the default for child blocks without session data
- Each child block is an independent Q&A card with its own algorithm and session data
- Navigating up/down only changes the viewing position; grading is triggered separately
- After grading, the system auto-advances to the next due child block
- Re-grading a previously studied child block overrides its session data (with on-screen reminder)

##### Interaction Mode Scope

Interaction mode (Normal/LBL) is a **parent-level property only**:

- Child blocks always have `interaction: NORMAL` — they never store or read interaction fields
- `InteractionSelector` always displays the parent card's interaction, regardless of which child line is active
- Switching interaction mode operates on the parent card directly
- When a child block becomes an independent card, it defaults to `NORMAL` interaction mode

##### SM2 Interaction in LBL Mode

When using SM2 (a Q&A grading algorithm) within LBL mode, a special interaction flow applies:

1. **Switching to SM2**: The system auto-navigates back one line and hides the SM2 line, showing a "Show Answer" button
2. **Clicking "Show Answer"**: Reveals the SM2 line and displays grading buttons for re-evaluation
3. **This logic only applies to LBL mode** — Normal cards' SM2 switch only affects hide/re-answer functionality

> **⚠️ Note for future algorithm developers**: When adding new Q&A grading algorithms, follow this same interaction pattern in LBL mode — switch should trigger back-navigation + hide, and Show Answer should reveal + advance.

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
│   │   └── [[April 13th, 2026]] 🔴    ← Older session
│   └── ...
├── cache (heading block)
└── settings (heading block)
```

**Key principles**:
- The latest session block is the single source of truth
- Field naming follows `{owner}_{purpose}` convention: `sm2_*`, `progressive_*`, `fixed_*`
- Each algorithm only modifies its OWN fields; other fields are inherited unchanged → switching algorithms never loses data
- LBL child blocks have independent sessions (legacy `lbl_progress` has been migrated)
- `progressive_interval` is the calculated interval (2→6→12→24→48→96 days) based on `progressive_repetitions`
- `fixed_multiplier` + `fixed_unit` store the user's interval choice for Fixed Time cards

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

### Why the `{owner}_{purpose}` field naming convention?
Old names (`repetitions`, `interval`, `eFactor`) were ambiguous — they didn't indicate which algorithm owned them. New names (`sm2_repetitions`, `progressive_interval`) make field ownership explicit, reducing cross-algorithm pollution bugs.

### Why update same-day session blocks instead of creating new ones?
Previously, reinserted cards graded again on the same day produced duplicate `[[Date]]` blocks, causing data bloat. The new behavior updates the existing same-day session block in-place — each card has at most one session block per day.

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
npm install
npm run build        # Production build → build/extension.js
npm run typecheck    # TypeScript type checking
npm run test         # Run tests
```

### Project Structure

```
src/
├── extension.tsx          # Plugin entry point (onload/onunload)
├── app.tsx                # Root React component
├── practice.ts            # SM2 + Progressive + Fixed Time algorithms
├── constants.ts           # Shared constants
├── models/
│   ├── session.ts         # Session, CardMeta, SchedulingAlgorithm, FixedTimeUnit, InteractionStyle
│   └── practice.ts        # Today's review status model
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
│   ├── useLineByLineReview.ts # LBL interaction logic
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
