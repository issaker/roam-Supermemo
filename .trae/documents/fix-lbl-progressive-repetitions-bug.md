# Bug 修复计划：LBL 逐行学习模式的两个 Bug

## Bug 1：子 block 第一次阅读就被记录为 `progressive_repetitions:: 2`

### 根因分析

在 [useLineByLineReview.ts:154-167](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/hooks/useLineByLineReview.ts#L154-L167) 的 Progressive 路径中，`progressive_repetitions` 被**两次递增**：

1. **第一次递增**（第 165 行）：`progressive_repetitions: progReps + 1` — 在构建 `childPracticeProps` 时手动将 0 → 1
2. **第二次递增**（[practice.ts:121](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/practice.ts#L121)）：`progressive_repetitions: currentProgReps + 1` — `generatePracticeData` 内部又将 1 → 2

结果：新子 block 第一次阅读时：
- **实际**：`progressive_repetitions: 2`，`progressive_interval: 6`
- **期望**：`progressive_repetitions: 1`，`progressive_interval: 2`

同样的问题也存在于 SM2 路径（[useLineByLineReview.ts:226-245](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/hooks/useLineByLineReview.ts#L226-L245)）：`supermemo` 被调用了两次——一次在 hook 中，一次在 `generatePracticeData` 中，导致 SM2 字段被双重计算。

### 修复方案

修改 `useLineByLineReview.ts`，**不再预计算算法结果**，而是将原始 session 数据 + grade 直接传给 `generatePracticeData`，让它作为唯一的算法计算入口。

**Progressive 路径修改**（第 154-167 行）：
- 移除 `progressiveInterval(progReps)` 调用和 `childNextDueDate` 预计算
- 移除 `progressive_repetitions: progReps + 1` 预递增
- 从 `childResult.nextDueDate` 获取 `childNextDueDate`

**SM2 路径修改**（第 226-245 行）：
- 移除 `supermemo()` 调用和 `sm2Result` 预计算
- 只传递 `sm2_grade: grade`，让 `generatePracticeData` 内部处理 `supermemo` 计算
- 从 `childResult.nextDueDate` 获取 `childNextDueDate`

---

## Bug 2：父级 block 作为新卡片不会记录任何数据，下次刷到默认为 NORMAL 而非 LBL

### 根因分析

[save.ts:80-125](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/queries/save.ts#L80-L125) 中的 `upsertLatestSessionField` 函数，当找不到日期头 session block 时直接 return：

```typescript
if (!dateBlocks.length) return;  // 第 105 行
```

这导致：
1. **`updateReviewConfig` 无法持久化新卡片的模式切换**：用户将新卡片从 NORMAL 切换到 LBL 时，`upsertLatestSessionField` 找不到日期 block，`interaction:: LBL` 和 `algorithm:: PROGRESSIVE` 不会被写入数据页
2. **`updateParentNextDueDate` 无法持久化父级的 `nextDueDate`**：子 block 复习后，父级的 `nextDueDate` 也无法写入

结果：新 LBL 卡片在重新加载数据后，`resolveReviewConfig` 回退到默认值 `PROGRESSIVE + NORMAL`，丢失 LBL 模式。

### 修复方案

修改 `upsertLatestSessionField`，当没有日期头 session block 时，**创建一个新的日期头 block**，然后写入字段，而不是静默返回。

具体修改（[save.ts:105](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/queries/save.ts#L105)）：

```typescript
// 修改前：
if (!dateBlocks.length) return;

// 修改后：
if (!dateBlocks.length) {
  const dateStr = stringUtils.dateToRoamDateString(new Date());
  const sessionBlockUid = await createChildBlock(
    cardDataBlockUid,
    `[[${dateStr}]] ⚪`,
    0,
    { open: false }
  );
  await createChildBlock(sessionBlockUid, `${key}:: ${value}`, -1);
  return;
}
```

---

## 实施步骤

1. **修复 Bug 1 - Progressive 路径双重递增**：修改 `useLineByLineReview.ts` 第 154-223 行，移除预计算，将原始数据传给 `generatePracticeData`
2. **修复 Bug 1 - SM2 路径双重计算**：修改 `useLineByLineReview.ts` 第 226-309 行，移除预计算，将原始数据 + grade 传给 `generatePracticeData`
3. **修复 Bug 2 - 新卡片 session block 不存在时无法持久化**：修改 `save.ts` 的 `upsertLatestSessionField` 函数，在没有日期 block 时自动创建
4. **验证**：运行 lint/typecheck 确保代码正确
