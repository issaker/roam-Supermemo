# Queue System Refactor — Verification Checklist

## Phase 1: Unified LBL Classification

- [ ] `classifyCard()` added to `models/session.ts` with both Normal and LBL paths
- [ ] `addDueCards` uses `classifyCard` for LBL cards (no longer relies solely on parent `nextDueDate`)
- [ ] `addDueCards` receives `lblDeckMeta` and `pluginPageData` params
- [ ] `getPracticeData` passes `lblDeckMeta` + `pluginPageData` to `addDueCards`
- [ ] `updateParentNextDueDate` no longer writes `dateCreated`
- [ ] `classifyCard` tests pass (Normal: due/new/completed/scheduled; LBL: due/new/completed/scheduled)
- [ ] Existing `session.test.ts` tests still pass
- [ ] Existing `today.test.ts` tests still pass
- [ ] Manual test: LBL card with due children appears in due queue even if parent `nextDueDate` is stale

## Phase 2: QueueSnapshot + Patch System

- [ ] `review-runtime/queue/types.ts` created with all type definitions
- [ ] `review-runtime/queue/buildQueue.ts` created and tested
- [ ] `review-runtime/queue/applyPatches.ts` created and tested
  - [ ] `complete` patch marks entry as completed
  - [ ] `reinsert` patch inserts virtual entry at correct position
  - [ ] `undo_complete` reverses completion
  - [ ] `undo_reinsert` removes virtual entry
  - [ ] Multiple patches compose correctly
- [ ] `review-runtime/queue/useQueue.ts` created
  - [ ] Snapshot built on sessionId change
  - [ ] Patches accumulate without modifying snapshot
  - [ ] `effectiveQueue` derived from snapshot + patches
- [ ] `useReviewRuntime` integrated with `useQueue`
  - [ ] `primaryQueue` state removed
  - [ ] `todaySealedRef` removed
  - [ ] `reinsertCard` splice replaced with `queue.reinsert()`
  - [ ] `prevCompletedUidsSetRef` sync effect removed
  - [ ] `reviewUnit` calls `queue.complete()` after grading
- [ ] `usePracticeData` simplified
  - [ ] `todaySealedRef` removed
  - [ ] `settingsFingerprintRef` removed
  - [ ] Only manages `practiceData` fetch + cache
- [ ] Manual test: Open review overlay, grade some cards, close and reopen — queue position preserved
- [ ] Manual test: Forgot reinsert works, card reappears at correct offset
- [ ] Manual test: Undo after Forgot reinsert removes the reinserted copy
- [ ] Manual test: Switch decks — queue rebuilds, currentIndex resets to first uncompleted
- [ ] Manual test: Change dailyLimit in settings — queue rebuilds
- [ ] No "queue jumps to 0/51" bug

## Phase 3: Simplified dailyLimit Allocation

- [ ] `allocateDailyCards` added to `dataProcessing.ts`
- [ ] `limitRemainingPracticeData` and its 5 sub-functions deleted
- [ ] `getPracticeData` calls `allocateDailyCards` instead
- [ ] `allocateDailyCards` tests pass:
  - [ ] No limit → cardSet unchanged
  - [ ] Zero remaining → empty due/new
  - [ ] Weight=0 decks excluded
  - [ ] Proportional distribution matches expected ratios
- [ ] Manual test: Daily limit with multiple decks — card counts match weight proportions

## Phase 4: Unified LBL Sub-Queue Derivation

- [ ] `deriveLblSubQueue` added to `models/practice.ts`
- [ ] `useLineByLineReview` uses `deriveLblSubQueue` exclusively
- [ ] `LineByLineView` receives `dueChildCount` as prop (no internal `getLblQueueState` call)
- [ ] `useReviewRuntime.reviewUnit` LBL path receives sub-queue state from `useLineByLineReview` (no internal `getLblQueueState` call)
- [ ] `getLblQueueState` only called from `deriveLblSubQueue` (single call site)
- [ ] `deriveLblSubQueue` tests pass
- [ ] Manual test: LBL review — grade child, next due child auto-focused
- [ ] Manual test: LBL review — all children mastered → card marked complete, auto-advance
- [ ] Manual test: LBL review — undo child grade → child becomes due again

## Phase 5: Documentation Updates

- [ ] README.md "Architecture — First Principles" rewritten
- [ ] README.md "Two-Layer Queue" updated to three-layer diagram
- [ ] README.md "LBL Container" section: `dateCreated` defensive mention removed
- [ ] README.md "Inviolable Rules": snapshot invariant added
- [ ] README.md "Runtime" table: `queue/` entries added
- [ ] README.md "Key Modules" table: paths and descriptions updated
- [ ] README.md "Key Pitfalls": updated for patch system
- [ ] CLAUDE.md "Architecture" updated to three layers
- [ ] CLAUDE.md "Inviolable Rules": snapshot invariant added
- [ ] CLAUDE.md "Key Modules": queue entries added
- [ ] CLAUDE.md "Key Patterns — Reinsert": patch-based description
- [ ] CLAUDE.md "Data Flow": queue layer added

## Cross-Phase Verification

- [ ] `npm run check` passes (lint + typecheck + test)
- [ ] No new `any` types introduced
- [ ] No defensive code added (no "just in case" writes, no fallback-to-previous-behavior guards)
- [ ] New public functions have one-line purpose comments
- [ ] Non-obvious invariants have inline notes
- [ ] No redundant comments (no restating-what-code-does)
- [ ] All new files follow existing import conventions (`~/` alias)
