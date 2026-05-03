# Queue System Refactor Spec

## Problem

Current queue system has accumulated fragility from multiple patches:

1. **LBL classification inconsistency**: `addDueCards` lacks LBL logic — LBL cards classified by parent `nextDueDate` instead of children's collective state, while `addNewCards` and `calculateCompletedTodayCounts` use `classifyLblDeck`
2. **Frozen Today Snapshot is a fragile patch**: `todaySealedRef` (boolean) lacks explicit session identity; can't handle Forgot reinsert or new cards appearing mid-session
3. **Reinsert causes unbounded queue growth**: `splice` inserts duplicate entries; `cardQueueLength` diverges from actual card count; undo can't remove reinsert copies
4. **LBL sub-queue derived from 3 separate call sites**: `useLineByLineReview`, `LineByLineView`, `useReviewRuntime.reviewUnit` each call `getLblQueueState` with different data sources
5. **dailyLimit allocation is over-engineered**: 5 sub-functions, 4 loop rounds for what is essentially proportional distribution
6. **Defensive `dateCreated` write on LBL parent**: `updateParentNextDueDate` writes parent `dateCreated` that nothing reads — `classifyLblDeck` derives from children

## Design Principles

- **No defensive programming**: If no code reads a field, don't write it. Remove `dateCreated` update in `updateParentNextDueDate`.
- **No backward compatibility**: Old behaviors that add complexity without value are removed, not preserved behind flags.
- **No over-engineering**: One line of code beats two. No abstract base classes, no visitor patterns, no unnecessary indirection. The queue is a flat array with patches — not a generic data structure.
- **Clear comments**: Every public function gets a one-line purpose comment. Non-obvious invariants get inline notes. No restating-what-code-does noise.
- **Queue is snapshot, not computation**: Built once per session, immutable. Changes are patches, not recalculations.

## Architecture

### Three Layers

```
Pipeline (queries/)          → pure functions, computes CardSet from Roam data
Queue   (review-runtime/)    → QueueSnapshot + patches, session-stable
Runtime (review-runtime/)    → facts + viewState + queue, coordinates everything
```

### Core Types

```typescript
// Session identity: one per day, derived from date
type SessionId = string; // "2026-05-02"

// Unified queue entry — Normal and LBL share the same structure
type QueueEntry = {
  uid: RecordUid;
  kind: 'normal' | 'lbl';
  childUids?: RecordUid[];   // LBL only
};

// Immutable snapshot, built once per session
type QueueSnapshot = {
  sessionId: SessionId;
  tag: string;
  entries: QueueEntry[];
  createdAt: Date;
};

// Incremental changes on top of snapshot
type QueuePatch =
  | { type: 'complete'; uid: RecordUid }
  | { type: 'reinsert'; uid: RecordUid; afterIndex: number; offset: number; reason: 'forgot' | 'lbl-next' }
  | { type: 'undo_complete'; uid: RecordUid }
  | { type: 'undo_reinsert'; uid: RecordUid; targetIndex: number };

// LBL sub-queue, derived on demand from facts
type LblSubQueue = {
  dueIndices: number[];
  nextDueIndex: number;
  isComplete: boolean;
};
```

### Pipeline: Unified Card Classification

Replace the 3 separate classification paths (addNewCards/addDueCards/calculateCompletedTodayCounts) with a single `classifyCard` function:

```typescript
type CardClass = 'due' | 'new' | 'completed' | 'scheduled';

// Single entry point for both Normal and LBL classification
const classifyCard = (
  uid: RecordUid,
  session: Session | undefined,
  lblChildren?: { uids: RecordUid[]; sessions: Record<string, Session | undefined> }
): CardClass => {
  if (lblChildren) return classifyFromChildren(lblChildren);
  return classifyFromSession(session);
};
```

Pipeline output becomes a flat `CardSet`:

```typescript
type CardSet = {
  due: RecordUid[];
  new: RecordUid[];
  completed: RecordUid[];
  lblMeta: Record<RecordUid, RecordUid[]>;  // parent → child UIDs
};
```

### Queue: Snapshot + Patch

`useQueue` hook replaces `primaryQueue` + `todaySealedRef`:

```typescript
const useQueue = (cardSet: CardSet, sessionId: SessionId) => {
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [patches, setPatches] = useState<QueuePatch[]>([]);

  // Rebuild only on sessionId change
  useEffect(() => {
    if (cardSet) {
      setSnapshot(buildQueue(cardSet, sessionId));
      setPatches([]);
    }
  }, [sessionId]);

  // Derive effective queue from snapshot + patches
  const effectiveQueue = useMemo(() => applyPatches(snapshot, patches), [snapshot, patches]);

  return { effectiveQueue, complete, reinsert, undo };
};
```

**Key invariant**: `snapshot.entries` never changes within a session. Only `patches` grows.

### Reinsert: Virtual Insertion, Not Duplication

Instead of `splice`-ing duplicate entries into the array, reinsert records a `QueuePatch`:

```typescript
// applyPatches computes the effective queue by inserting reinserted cards
// at their target positions without modifying the snapshot
const applyPatches = (snapshot: QueueSnapshot | null, patches: QueuePatch[]): EffectiveQueue => {
  // Start from snapshot entries
  // Apply 'complete' patches → mark entries as completed
  // Apply 'reinsert' patches → insert virtual entries at target positions
  // Apply 'undo_*' patches → reverse the corresponding patch
};
```

**Benefits**:
- `cardQueueLength` reflects real card count (no duplicates)
- Undo reinsert = remove the patch, not search-and-destroy in array
- Patch log provides full operation history

### LBL Sub-Queue: Single Derivation Point

One function, called from one place:

```typescript
// Called only by useLineByLineReview, which is the single owner of LBL navigation
const deriveLblSubQueue = (
  childUids: RecordUid[],
  facts: SessionFacts,
  fromIndex?: number
): LblSubQueue => { ... };
```

`LineByLineView` and `useReviewRuntime.reviewUnit` no longer call `getLblQueueState` directly. They receive sub-queue state from `useLineByLineReview`.

### dailyLimit: Simplified Allocation

Replace 5 sub-functions + 4 loop rounds with 1 function:

```typescript
// Proportional allocation: 75% due + 25% new, split by deck weight
const allocateDailyCards = (cardSet: CardSet, limit: number, weights: Record<string, number>): CardSet => { ... };
```

### Data Refresh Strategy

```
Refresh trigger (visibility / block edit / tag change)
  │
  ├─ Same sessionId?
  │   YES → update facts.latestByUid only; snapshot untouched
  │   NO  → rebuild snapshot (new day or settings change)
  │
  └─ Settings changed?
      YES → rebuild snapshot (dailyLimit / deckConfigs / shuffle)
      NO  → update facts only
```

### Removed Code

| What | Why |
|------|-----|
| `todaySealedRef` in usePracticeData | Replaced by sessionId-gated snapshot |
| `reinsertCard` splice in useReviewRuntime | Replaced by QueuePatch system |
| `prevCompletedUidsSetRef` sync effect | Replaced by patch-based completion tracking |
| `updateParentNextDueDate` dateCreated write | Nothing reads it; classifyLblDeck uses children |
| 5 sub-functions in `limitRemainingPracticeData` | Replaced by single `allocateDailyCards` |
| `getLblQueueState` calls in LineByLineView & reviewUnit | Converged to `deriveLblSubQueue` in useLineByLineReview |

### README Updates

Sections to update in README.md:

1. **"Architecture — First Principles"** → Rewrite to reflect QueueSnapshot + Patch model
2. **"Two-Layer Queue"** → Update diagram to show three layers (Pipeline / Queue / Runtime)
3. **"LBL Container (Mini-Deck)"** → Remove `dateCreated` defensive mention; clarify that parent stores ONLY `algorithm`, `interaction`, `nextDueDate`
4. **"Inviolable Rules"** → Add: "Queue is snapshot, not computation. Built once per session, changed only by patches."
5. **"Runtime" table** → Add `queue/` subdirectory entries
6. **"Key Modules" table** → Update file paths and descriptions
7. **"Key Pitfalls"** → Remove mirrored state warning (patch system eliminates it); add patch-ordering note

CLAUDE.md updates:

1. **"Architecture — Two Layers"** → Update to three layers
2. **"Inviolable Rules"** → Add snapshot invariant
3. **"Key Modules" table** → Add queue module entries
4. **"Key Patterns"** → Replace Reinsert section with patch-based description
5. **"Data Flow"** → Add queue layer between usePracticeData and useReviewRuntime
