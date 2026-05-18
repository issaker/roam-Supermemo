# Queue System Refactor — Task Breakdown

## Phase 1: Unified LBL Classification

Low risk. No queue management changes. Only fixes classification consistency.

### 1.1 Add `classifyCard` to `models/session.ts`

- **File**: `src/models/session.ts`
- **Action**: Add `classifyCard()` — single entry point for Normal and LBL classification
- **Logic**: If `lblChildren` provided → `classifyFromChildren()` (wraps existing `classifyLblDeck`); else → `classifyFromSession()` (wraps existing `isSessionDue`/`isSessionMastered` logic)
- **Export**: `classifyCard`, `CardClass`

### 1.2 Refactor `addDueCards` to use `classifyCard`

- **File**: `src/queries/today.ts`
- **Action**: In `addDueCards`, filter LBL cards through `classifyCard` instead of `sortNormalDueCardUids` alone
- **Logic**: For each card uid, if `lblDeckMeta[uid]` exists, use `classifyCard(uid, session, lblChildren)` to determine if it's `due`; otherwise use existing `isSessionDue` check
- **Input**: Add `lblDeckMeta` and `pluginPageData` params to `addDueCards`

### 1.3 Remove defensive `dateCreated` write in `updateParentNextDueDate`

- **File**: `src/queries/save.ts`
- **Action**: Delete the `upsertLatestSessionField({ cardDataBlockUid, key: 'dateCreated', ... })` call at the end of `updateParentNextDueDate`
- **Rationale**: `classifyLblDeck` derives from children, never reads parent `dateCreated`. Writing it is defensive code with no consumer.

### 1.4 Update `getPracticeData` to pass `lblDeckMeta` to `addDueCards`

- **File**: `src/queries/data.ts`
- **Action**: Add `lblDeckMeta` and `pluginPageData` to the `addDueCards` call

### 1.5 Tests

- **File**: `src/models/session.test.ts`
- **Action**: Add tests for `classifyCard` covering Normal due/new/completed/scheduled and LBL due/new/completed/scheduled
- **File**: `src/queries/today.test.ts`
- **Action**: Add test verifying LBL cards appear in `dueUids` when children are due

---

## Phase 2: QueueSnapshot + Patch System

Medium risk. Core queue management rewrite.

### 2.1 Create `review-runtime/queue/types.ts`

- **File**: `src/review-runtime/queue/types.ts` (new)
- **Content**: `QueueEntry`, `QueueSnapshot`, `QueuePatch`, `EffectiveQueue`, `LblSubQueue` type definitions
- **Comments**: One-line purpose comment per type

### 2.2 Create `review-runtime/queue/buildQueue.ts`

- **File**: `src/review-runtime/queue/buildQueue.ts` (new)
- **Content**: `buildQueue(cardSet, sessionId)` — converts `CardSet` into `QueueSnapshot`
- **Logic**: Concat `completed + due + new` entries, deduplicate by uid, assign `kind: 'lbl'` for entries in `lblMeta`
- **Comments**: Explain ordering convention (completed first → due → new)

### 2.3 Create `review-runtime/queue/applyPatches.ts`

- **File**: `src/review-runtime/queue/applyPatches.ts` (new)
- **Content**: `applyPatches(snapshot, patches)` → `EffectiveQueue`
- **Logic**:
  - Start from snapshot entries
  - `complete`: mark entry as completed (for display, not removal)
  - `reinsert`: insert virtual entry at `afterIndex + 1 + offset`
  - `undo_complete`: unmark entry
  - `undo_reinsert`: remove virtual entry at `targetIndex`
- **Comments**: Explain that completed entries stay in queue (for undo), `currentIndex` skips them

### 2.4 Create `review-runtime/queue/useQueue.ts`

- **File**: `src/review-runtime/queue/useQueue.ts` (new)
- **Content**: `useQueue(cardSet, sessionId)` hook
- **Logic**:
  - `useState<QueueSnapshot>` — built on sessionId change
  - `useState<QueuePatch[]>` — accumulated patches
  - `effectiveQueue = useMemo(applyPatches)`
  - `complete(uid)` → append `{ type: 'complete', uid }` patch
  - `reinsert(uid, afterIndex, offset, reason)` → append reinsert patch
  - `undoComplete(uid)` → append undo_complete patch
  - `undoReinsert(uid, targetIndex)` → append undo_reinsert patch
- **Comments**: Key invariant — snapshot.entries never changes within a session

### 2.5 Integrate `useQueue` into `useReviewRuntime`

- **File**: `src/review-runtime/useReviewRuntime.ts`
- **Action**:
  - Replace `primaryQueue` state + `initialUids` memo + `todaySealedRef` logic with `useQueue`
  - Replace `reinsertCard` splice with `queue.reinsert()`
  - Replace completed-card tracking with `queue.complete()`
  - Remove `prevCompletedUidsSetRef` sync effect
  - Keep `facts`, `viewState`, `reviewUnit`, `updateReviewConfigAction` as-is
- **Comments**: Note that `reviewUnit` now calls `queue.complete()` instead of relying on data-refresh sync

### 2.6 Update `usePracticeData` — remove `todaySealedRef`

- **File**: `src/hooks/usePracticeData.tsx`
- **Action**:
  - Remove `todaySealedRef`, `settingsFingerprintRef` logic
  - `usePracticeData` now only manages `practiceData` (facts) and raw `today` stats
  - Queue construction moves to `useQueue` — `usePracticeData` no longer freezes/patches today
  - Compute `sessionId` from current date, pass to `useQueue`
- **Simplification**: `usePracticeData` becomes a simple fetch + cache hook

### 2.7 Tests

- **File**: `src/review-runtime/queue/applyPatches.test.ts` (new)
- **Action**: Test all 4 patch types + undo scenarios
- **File**: `src/review-runtime/queue/buildQueue.test.ts` (new)
- **Action**: Test CardSet → QueueSnapshot conversion with Normal + LBL entries

---

## Phase 3: Simplified dailyLimit Allocation

Low risk. Pure function replacement.

### 3.1 Create `allocateDailyCards` in `queries/dataProcessing.ts`

- **File**: `src/queries/dataProcessing.ts`
- **Action**: Add `allocateDailyCards(cardSet, limit, weights)` function
- **Logic**:
  - If no limit or no remaining → return cardSet as-is
  - `remaining = max(limit - completed, 0)`
  - `targetDue = remaining - floor(remaining * 0.25)`, `targetNew = remaining - targetDue`
  - Distribute due/new proportionally by deck weight
  - Return trimmed cardSet
- **Comments**: One-pass proportional allocation replaces 4-round round-robin

### 3.2 Replace `limitRemainingPracticeData` with `allocateDailyCards`

- **File**: `src/queries/dataProcessing.ts`
- **Action**: Delete `zeroOutWeightZeroDecks`, `allocateDeckCaps`, `selectCardsByRoundRobin`, `redistributeOverflow`, `trimExcessCards`, `limitRemainingPracticeData`
- **File**: `src/queries/data.ts`
- **Action**: Replace `limitRemainingPracticeData` call with `allocateDailyCards`

### 3.3 Tests

- **File**: `src/queries/dataProcessing.test.ts`
- **Action**: Add tests for `allocateDailyCards` covering: no limit, zero remaining, weight=0 decks, proportional distribution

---

## Phase 4: Unified LBL Sub-Queue Derivation

Medium risk. Converges 3 call sites to 1.

### 4.1 Add `deriveLblSubQueue` to `models/practice.ts`

- **File**: `src/models/practice.ts`
- **Action**: Add `deriveLblSubQueue(childUids, childSessionData, fromIndex?)` — thin wrapper over `getLblQueueState` that returns `LblSubQueue`
- **Comments**: Single derivation point for all LBL sub-queue state

### 4.2 Refactor `useLineByLineReview` to own all LBL sub-queue state

- **File**: `src/hooks/useLineByLineReview.ts`
- **Action**: Use `deriveLblSubQueue` exclusively; expose `dueChildCount`, `nextDueIndex` as return values
- **No change**: `useLineByLineReview` already calls `getLblQueueState` — just switch to `deriveLblSubQueue`

### 4.3 Remove `getLblQueueState` call from `LineByLineView`

- **File**: `src/components/overlay/LineByLineView.tsx`
- **Action**: Accept `dueChildCount` as prop instead of computing it internally
- **Rationale**: `useLineByLineReview` already computes this; duplicating is a second source of truth

### 4.4 Remove `getLblQueueState` call from `useReviewRuntime.reviewUnit`

- **File**: `src/review-runtime/useReviewRuntime.ts`
- **Action**: In `reviewUnit` LBL child grading path, receive `nextDueIndex` and `isCardComplete` from `useLineByLineReview` instead of calling `getLblQueueState` with `updatedChildSessionsForParent`
- **Logic**: `useLineByLineReview.onLineByLineGrade` already computes the next position after grading; pass it back to `reviewUnit`

### 4.5 Tests

- **File**: `src/models/practice.test.ts`
- **Action**: Add tests for `deriveLblSubQueue` covering: all due, partial due, all mastered, fromIndex offset

---

## Phase 5: Documentation Updates

### 5.1 Update README.md

- **Section "Architecture — First Principles"**: Rewrite to QueueSnapshot + Patch model
- **Section "Two-Layer Queue"**: Update to three-layer diagram (Pipeline / Queue / Runtime)
- **Section "LBL Container (Mini-Deck)"**: Remove `dateCreated` defensive mention
- **Section "Inviolable Rules"**: Add snapshot invariant rule
- **Section "Runtime" table**: Add `queue/` entries
- **Section "Key Modules" table**: Update paths and descriptions
- **Section "Key Pitfalls"**: Replace mirrored state warning with patch-ordering note

### 5.2 Update CLAUDE.md

- **"Architecture — Two Layers"**: Update to three layers
- **"Inviolable Rules"**: Add snapshot invariant
- **"Key Modules" table**: Add queue module entries
- **"Key Patterns — Reinsert"**: Replace splice description with patch-based description
- **"Data Flow"**: Add queue layer
