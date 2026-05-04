# 计划：剔除已被用户删除的 Block 卡片

## 背景

队列系统采用**不可变快照 + 补丁**架构。用户在 Roam 中删除 block 后，uid 仍留在队列中，渲染时触发 `Block with uid "xxx" could not be found` 错误，项目无清理逻辑。

## 目标

在队列补丁范畴内增加 `remove` 补丁类型，在刷新队列时（重启会话 / 切换牌组）批量检测并移除已删除 block。

## 实现步骤（5 个文件，0 个新建）

### Step 1: 扩展 `QueuePatch` 类型

**文件**: `src/review-runtime/queue/types.ts`

```typescript
export type QueuePatch =
  | { type: 'complete'; uid: RecordUid }
  | { type: 'reinsert'; uid: RecordUid; afterIndex: number; offset: number; reason: 'forgot' | 'lbl-next' }
  | { type: 'remove'; uid: RecordUid };
```

### Step 2: 在 `applyPatches` 中处理 `remove`

**文件**: `src/review-runtime/queue/applyPatches.ts`

- 收集 `remove` 补丁的 uid 到 `removedUids` 集合
- 从 `baseUids` 中过滤掉已删除 uid
- 递减 `preCompletedCount`（若被删 uid 在已完成范围内）
- 从 `completedUids` 中移除已删除 uid
- 调整 `uniqueCount`

### Step 3: 扩展 `useQueue`

**文件**: `src/review-runtime/queue/useQueue.ts`

1. **`remove` 回调**：与 `complete` 同构，追加 `{ type: 'remove', uid }` 补丁
2. **`checkDeleted` 函数**：用 Roam Datalog 批量查询当前快照中哪些 uid 不存在，对不存在的追加 `remove` 补丁
3. **自动检测**：新快照创建时自动调用 `checkDeleted`
4. 返回 `remove` 和 `checkDeleted`

批量查询逻辑（内联在 useQueue 中，不新建文件）：
```typescript
const findDeletedUids = async (uids: string[]): Promise<string[]> => {
  const existing = await window.roamAlphaAPI.q(
    `[:find ?uid :in $ [?uid ...] :where [?block :block/uid ?uid]]`,
    uids
  );
  const existingSet = new Set(existing.map((r) => r[0]));
  return uids.filter((uid) => !existingSet.has(uid));
};
```

### Step 4: 透传到 `useReviewRuntime`

**文件**: `src/review-runtime/useReviewRuntime.ts`

- 从 `useQueue` 解构 `remove` 和 `checkDeleted`
- 在返回值中暴露

### Step 5: Overlay 打开时触发检测

**文件**: `src/components/overlay/PracticeOverlay.tsx`

- 从 runtime 获取 `checkDeleted`
- 在 overlay 打开时（已有的 `isOpen` effect 中），调用 `checkDeleted()`

## 数据流

```
刷新操作（重启会话 / 切换牌组 / overlay 打开）
    │
    ▼
checkDeleted() ──→ findDeletedUids(snapshot.entries) ──→ 批量追加 remove 补丁
    │
    ▼
applyPatches 过滤已删除 uid ──→ EffectiveQueue 不含已删除卡片
```

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src/review-runtime/queue/types.ts` | 扩展 QueuePatch |
| `src/review-runtime/queue/applyPatches.ts` | 处理 remove 补丁 |
| `src/review-runtime/queue/useQueue.ts` | remove 回调 + checkDeleted + 自动检测 |
| `src/review-runtime/useReviewRuntime.ts` | 透传 remove / checkDeleted |
| `src/components/overlay/PracticeOverlay.tsx` | overlay 打开时调用 checkDeleted |
