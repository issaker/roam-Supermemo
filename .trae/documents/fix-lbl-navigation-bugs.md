# LBL 模式上下翻行功能 Bug 修复计划

## Bug 分析

### Bug 1: Progressive 子 block 评分后 algorithm 被错误保存为 SM2

**根因**：`onLineByLineGrade` 中 LblNext 分支（第169-239行），`generatePracticeData` 的返回结果 `childResult` 中包含 `algorithm: currentChildAlgorithm`。但在 `setChildSessionData` 和 `setSessionOverrides` 中，使用了 `{ ...existingChildSession, ...childResult, dateCreated: now }`。

问题在于 `existingChildSession` 是通过 `childSessionData[childUid] || generateNewSession({ algorithm: currentChildAlgorithm })` 获取的。对于**新子 block**（没有 session 数据），`generateNewSession` 返回的对象中 `algorithm` 默认为 `PROGRESSIVE`，但 `currentChildAlgorithm` 可能正确。然而 `childResult` 来自 `generatePracticeData`，其返回值中 `algorithm` 字段是正确的。

**真正的问题**：查看用户提供的数据记录 `algorithm:: SM2` 但同时有 `progressive_interval:: 2` 和 `progressive_repetitions:: 1`，这说明子 block 的 algorithm 被错误地保存为 SM2。原因是 `savePracticeData` 在写入时，`algorithm` 和 `interaction` 字段在最后才写入（第245-250行），而 `generatePracticeData` 的 PROGRESSIVE 路径返回的 `childResult` 中确实包含 `algorithm: PROGRESSIVE`。

**但** `onLineByLineGrade` 中 LblNext 分支的 `childPracticeProps` 没有传入 `sm2_grade`，所以 `generatePracticeData` 被调用时 `sm2_grade` 为 `undefined`。`generatePracticeData` 的 PROGRESSIVE 路径会 pass-through `sm2_grade`（如果存在），但不会设置它。所以 `childResult` 中 `sm2_grade` 应该是 undefined。

**实际根因**：`savePracticeData` 的同日去重逻辑（第190-209行）会从现有 session block 中回填缺失字段。当用户先以 SM2 评分（产生 `sm2_grade`、`algorithm:: SM2`），然后以 Progressive 重新评分时，`savePracticeData` 的回填逻辑会把旧的 `algorithm:: SM2` 回填到 `data` 中（因为 PROGRESSIVE 路径的 `childResult` 不包含 `sm2_grade`，但 `data` 中已有 `algorithm` 字段，所以不会被回填）。

等等，让我重新分析。`childResult` 来自 `generatePracticeData`，PROGRESSIVE 路径返回 `{ algorithm: PROGRESSIVE, ... }`，所以 `data.algorithm` 是 PROGRESSIVE。`savePracticeData` 中 `data[key] === undefined` 才会回填，`algorithm` 不为 undefined，所以不会被回填。

**重新分析根因**：查看 `onLineByLineGrade` 的 LblNext 分支（第169-239行），`childPracticeProps` 中 `algorithm: currentChildAlgorithm`。`currentChildAlgorithm` 是从 `childSessionData[childUid]?.algorithm || algorithm` 计算的。如果 `childSessionData` 还没加载完成（异步），`childSessionData[childUid]` 为 undefined，那么 `currentChildAlgorithm` 会 fallback 到父级的 `algorithm`（即 SM2）。这就是为什么 Progressive 子 block 被保存为 SM2 的原因！

**根因确认**：`currentChildAlgorithm` 在 `childSessionData` 未加载时 fallback 到父级 `algorithm`，导致 Progressive 子 block 被当作 SM2 处理。

### Bug 2: 重启会话从第一行开始而非跳过已学习的子 block

**根因**：`useLineByLineReview` 的初始化 useEffect（第140-156行）依赖 `childSessionData` 来计算 `findNextDueChildIndex`。但 `childSessionData` 是异步加载的（PracticeOverlay 第281-289行），初始值为 `{}`。当 useEffect 首次触发时，`childSessionData` 为空对象，所有子 block 都被视为"到期"，所以 `findNextDueChildIndex` 返回 0。

当 `childSessionData` 加载完成后，useEffect 再次触发，但此时如果用户已经开始交互（评分了某些子 block），`childSessionData` 已经被 `setChildSessionData` 更新过，可能覆盖了从数据页加载的数据。

**另一个问题**：`sessionOverrides` 在重启会话时会被重置为 `{}`（因为 PracticeOverlay 重新挂载），但 `childSessionData` 是从数据页重新加载的。如果数据页上的数据是正确的（子 block 的 nextDueDate 已更新为未来日期），那么 `findNextDueChildIndex` 应该能正确跳过已学习的子 block。

**但**如果 Bug 1 导致子 block 的 algorithm 被错误保存为 SM2，那么 `generatePracticeData` 会按 SM2 路径计算，`nextDueDate` 可能不正确（SM2 的 interval 为 0 意味着 nextDueDate = today），导致子 block 仍然被视为"到期"。

**根因确认**：Bug 2 是 Bug 1 的连锁反应。由于子 block 的 algorithm 被错误保存为 SM2，SM2 的 sm2_interval=0 导致 nextDueDate=today，所以重启后子 block 仍被视为到期。

### Bug 3: Progressive LBL 卡片显示 Show Answer 按钮

**根因**：PracticeOverlay 的 showAnswers useEffect（第339-356行）中，LBL 模式下的判断逻辑是：
```
if (currentChildIsLblNext) {
  setShowAnswers(true);
} else {
  setShowAnswers(false);
}
```

`currentChildIsLblNext` 是 `!isGradingAlgorithm(currentChildAlgorithm)`，即当 `currentChildAlgorithm` 不是 SM2 时为 true。

**但**如果 `currentChildAlgorithm` 因为 Bug 1 被错误计算为 SM2（因为 `childSessionData` 未加载完成，fallback 到父级 SM2 algorithm），那么 `currentChildIsLblNext` 为 false，导致 `setShowAnswers(false)`，从而显示 Show Answer 按钮。

**根因确认**：Bug 3 也是 Bug 1 的连锁反应。`currentChildAlgorithm` 在 `childSessionData` 未加载时 fallback 到父级 algorithm，导致 Progressive 子 block 被误判为 SM2。

## 修复方案

### 修复 1: `currentChildAlgorithm` 在 childSessionData 未加载时的处理

**文件**: `src/hooks/useLineByLineReview.ts`

**问题**: `currentChildAlgorithm` 在 `childSessionData[childUid]` 不存在时 fallback 到父级 `algorithm`，但新子 block 可能使用与父级不同的算法。

**修复**: 当 `childSessionData` 为空对象（尚未加载）时，`currentChildAlgorithm` 不应 fallback 到父级 algorithm，而应返回 `undefined` 或保持一个"加载中"状态。但这会导致 UI 问题。

**更好的修复**: 在 `onLineByLineGrade` 中，当 `childSessionData[childUid]` 不存在时，不应使用 `currentChildAlgorithm`（可能基于过时的 childSessionData），而应从最新的 `childSessionData` 中获取。但由于 `onLineByLineGrade` 是 useCallback，其闭包中的 `childSessionData` 可能过时。

**最简修复**: 在 `onLineByLineGrade` 中，不使用 `currentChildAlgorithm`（闭包中可能过时），而是实时从 `childSessionData` 中读取当前子 block 的 algorithm。但由于 React 状态更新是异步的，闭包中的 `childSessionData` 可能不包含最新数据。

**实际修复方案**: 
1. 在 `onLineByLineGrade` 的 LblNext 分支中，当 `existingChildSession` 是新生成的（`generateNewSession`），且 `currentChildAlgorithm` 是从父级 fallback 来的时，应该使用 `existingChildSession.algorithm`（即 `generateNewSession({ algorithm: currentChildAlgorithm })` 中的 algorithm）而不是 `currentChildAlgorithm`。但这其实是一样的。

让我重新分析。问题的核心是：**`currentChildAlgorithm` 的计算时机**。

`currentChildAlgorithm` 是 useMemo，依赖 `childSessionData`。当 `childSessionData` 为空 `{}` 时，`childSessionData[childUid]` 为 undefined，所以 fallback 到 `algorithm`（父级）。

当 `childSessionData` 加载完成后，`childSessionData[childUid]` 应该包含正确的 algorithm（从数据页读取的）。但如果子 block 是新的（没有数据页记录），`getChildSessionData` 返回的数据中也不会有该子 block 的记录，所以 `childSessionData[childUid]` 仍然为 undefined。

**关键洞察**: 对于新子 block（没有 session 数据），它的 algorithm 应该继承父级的 algorithm 作为默认值。这是设计意图。但如果用户通过 `onSelectAlgorithm` 将某个子 block 的算法改为 Progressive，然后评分，此时 `childSessionData[childUid]` 应该已经包含 `algorithm: PROGRESSIVE`（因为 `onSelectAlgorithm` 会更新 `childSessionData`）。

**真正的问题场景**: 用户在 LBL 模式下，父级 algorithm 是 SM2，子 block 没有独立的 session 数据。用户通过 Algorithm Selector 将当前子 block 切换为 Progressive。`onSelectAlgorithm` 更新了 `childSessionData[childUid].algorithm = PROGRESSIVE`。然后用户点击 Next（触发 `onLineByLineGrade`），此时 `currentChildAlgorithm` 应该是 PROGRESSIVE（因为 `childSessionData[childUid].algorithm` 已被更新）。

但用户报告的数据显示 `algorithm:: SM2`，说明 `onLineByLineGrade` 执行时 `currentChildAlgorithm` 仍然是 SM2。这可能是因为：
1. `currentChildAlgorithm` 的 useMemo 闭包中 `childSessionData` 还没更新
2. 或者 `onLineByLineGrade` 的 useCallback 闭包中 `currentChildAlgorithm` 是过时的

**发现根因**: `onLineByLineGrade` 的依赖数组中有 `currentChildAlgorithm`，但 `currentChildAlgorithm` 是 useMemo。当 `childSessionData` 更新后，`currentChildAlgorithm` 会重新计算。但 `onLineByLineGrade` 的 useCallback 是否会立即获取到新的 `currentChildAlgorithm`？

答案是不会，因为 React 的 useCallback 在依赖变化时会在**下一次渲染**才更新。如果 `onSelectAlgorithm` 更新了 `childSessionData`，然后用户在同一渲染周期内点击 Next，`onLineByLineGrade` 仍然使用旧的 `currentChildAlgorithm`。

但这不太可能是常见场景。更可能的问题是：

**重新审视**: 用户说"Next 下一行，上一行的学习数据不能被正确保存"。这意味着用户在第一行（Progressive）点击 Next 后，数据被保存为 SM2。

让我再仔细看 `onLineByLineGrade` 的 LblNext 分支：

```typescript
if (currentChildIsLblNext) {
  const childPracticeProps = {
    ...existingChildSession,
    refUid: childUid,
    dataPageTitle,
    algorithm: currentChildAlgorithm,
    interaction: InteractionStyle.NORMAL,
  };
  const childResult = generatePracticeData({ ...childPracticeProps, dateCreated: now });
```

`existingChildSession = childSessionData[childUid] || generateNewSession({ algorithm: currentChildAlgorithm })`

如果 `childSessionData[childUid]` 存在且 `algorithm` 为 PROGRESSIVE，那么 `existingChildSession.algorithm` 是 PROGRESSIVE。`childPracticeProps` 中 `algorithm: currentChildAlgorithm`，如果 `currentChildAlgorithm` 也是 PROGRESSIVE，那么 `generatePracticeData` 会走 PROGRESSIVE 路径，返回 `algorithm: PROGRESSIVE`。

但如果 `childSessionData[childUid]` 不存在（新子 block），`existingChildSession = generateNewSession({ algorithm: currentChildAlgorithm })`。如果 `currentChildAlgorithm` 是 SM2（因为 fallback 到父级），那么 `generateNewSession` 返回 `algorithm: SM2`，`childPracticeProps.algorithm` 也是 SM2，`generatePracticeData` 走 SM2 路径。

**这就是 Bug 1 的根因！** 对于新子 block，如果父级是 SM2 但子 block 实际应该是 Progressive（因为用户切换了算法或默认应该是 Progressive），`currentChildAlgorithm` fallback 到父级 SM2，导致评分时使用 SM2 算法。

**但等等**，用户说"上一行我是 Progressive"，这意味着用户已经将子 block 切换为 Progressive 了。`onSelectAlgorithm` 应该已经更新了 `childSessionData[childUid].algorithm = PROGRESSIVE`。那为什么 `currentChildAlgorithm` 还是 SM2？

可能的原因：`onSelectAlgorithm` 更新了 `childSessionData`，但 `currentChildAlgorithm` 的 useMemo 还没重新计算（同一渲染周期），或者 `onLineByLineGrade` 的 useCallback 还没更新。

**更可能的原因**：用户没有通过 Algorithm Selector 切换算法。用户的意思是"这个子 block 应该是 Progressive"（因为父级卡片可能之前被设置为 Progressive），但由于父级 `algorithm` 字段是 SM2，新子 block 继承了 SM2。

让我重新理解用户场景：用户有一张 LBL 卡片，父级 algorithm 是 SM2。但某些子 block 用户期望是 Progressive。在之前的实现中，子 block 的 algorithm 由父级决定，所以所有子 block 都是 SM2。在 fix-lbl-algorithm-scope 之后，每个子 block 可以有独立的 algorithm。但新子 block 仍然继承父级 algorithm 作为默认值。

**用户真正的问题**：用户可能通过 Algorithm Selector 将子 block 切换为 Progressive，然后点击 Next。但 `onLineByLineGrade` 中的 `currentChildAlgorithm` 可能还没更新。

**或者**：用户没有切换算法，只是期望 Progressive 模式的 LBL 卡片（LblNext）在点击 Next 时正确保存。但父级 algorithm 是 SM2，所以 `currentChildIsLblNext` 为 false，不会进入 LblNext 分支，而是进入 SM2 分支，需要 Show Answer + Grade。

**最终根因分析**：

Bug 1、2、3 的根本原因是同一个：**`currentChildAlgorithm` 在 `childSessionData` 未加载或不包含某子 block 数据时，fallback 到父级 `algorithm`，导致子 block 的算法被错误地设为父级算法**。

具体场景：
- 父级 LBL 卡片 algorithm = SM2
- 子 block 没有独立 session 数据（新卡）
- `currentChildAlgorithm` fallback 到 SM2
- `currentChildIsLblNext = !isGradingAlgorithm(SM2) = false`
- 所以进入 SM2 分支，需要 Show Answer + Grade
- 即使用户期望 Progressive 行为

**但用户数据中 `progressive_interval:: 2` 和 `progressive_repetitions:: 1` 的存在**，说明 `generatePracticeData` 确实走了 PROGRESSIVE 路径（因为只有 PROGRESSIVE 路径才会设置这些字段）。同时 `algorithm:: SM2` 和 `sm2_eFactor:: 1.30` 说明也走了 SM2 路径。

**这说明数据被写了两次**：第一次以 PROGRESSIVE 保存（产生 progressive_interval 和 progressive_repetitions），第二次以 SM2 保存（覆盖了 algorithm 为 SM2，同时保留了 progressive 字段因为 SM2 路径会 pass-through）。

或者：`savePracticeData` 的同日去重回填逻辑导致了混合。第一次评分时 algorithm 正确为 PROGRESSIVE，但 `sm2_grade` 为 undefined。`savePracticeData` 写入时，PROGRESSIVE 路径的 `childResult` 不包含 `sm2_grade`，所以 `data.sm2_grade` 为 undefined。但 `savePracticeData` 的回填逻辑会从现有 session block 中回填 `sm2_grade`（如果存在且 `data.sm2_grade === undefined`）。

**等等，让我看 `savePracticeData` 的写入逻辑**：

```typescript
const fieldEntries = Object.keys(data)
  .filter((key) => data[key] !== undefined && key !== 'algorithm' && key !== 'interaction')
  .map((key) => { ... createChildBlock ... });

if (data.algorithm) {
  await createChildBlock(sessionBlockUid, `algorithm:: ${data.algorithm}`, -1);
}
if (data.interaction) {
  await createChildBlock(sessionBlockUid, `interaction:: ${data.interaction}`, -1);
}
```

`algorithm` 和 `interaction` 在最后写入。如果 `data.algorithm` 是 PROGRESSIVE，那写入的就是 `algorithm:: PROGRESSIVE`。

**那为什么用户看到 `algorithm:: SM2`？** 可能是因为用户先以 SM2 评分了该子 block（因为 Bug 3 导致 Show Answer 出现，用户点击了评分按钮），然后 `savePracticeData` 以 SM2 写入。之后用户可能又以 Progressive 评分，但 `savePracticeData` 的同日去重回填了旧的 SM2 字段。

**不对**，同日去重只在 `data[key] === undefined` 时回填。PROGRESSIVE 路径的 `childResult` 包含 `algorithm: PROGRESSIVE`，所以 `data.algorithm` 不为 undefined，不会被回填。

**最终结论**：Bug 的核心是 **`currentChildAlgorithm` fallback 到父级 algorithm 导致 Progressive 子 block 被当作 SM2 处理**。这导致了：
1. Progressive 子 block 被评分时使用 SM2 算法 → algorithm 被保存为 SM2
2. SM2 算法下 sm2_interval=0 → nextDueDate=today → 重启后仍到期
3. `currentChildIsLblNext=false` → 显示 Show Answer 按钮

## 修复步骤

### Step 1: 修复 `onLineByLineGrade` 中 algorithm 的获取方式

**文件**: `src/hooks/useLineByLineReview.ts`

在 `onLineByLineGrade` 中，不依赖闭包中的 `currentChildAlgorithm`，而是实时从 `childSessionData` 中读取当前子 block 的 algorithm：

```typescript
const onLineByLineGrade = React.useCallback(async (grade: number) => {
  if (!currentCardRefUid || lineByLineCurrentChildIndex >= childUidsList.length) return;

  const childUid = childUidsList[lineByLineCurrentChildIndex];
  const existingChildSession = childSessionData[childUid] || generateNewSession({ algorithm });
  
  // 实时从 childSessionData 获取当前子 block 的 algorithm
  const effectiveChildAlgorithm = existingChildSession.algorithm || algorithm;
  const isLblNext = !isGradingAlgorithm(effectiveChildAlgorithm);
  
  // ... 使用 effectiveChildAlgorithm 和 isLblNext 替代 currentChildAlgorithm 和 currentChildIsLblNext
```

这样确保评分时使用的是最新的子 block algorithm，而不是可能过时的 `currentChildAlgorithm`。

### Step 2: 修复 `currentChildAlgorithm` 的 fallback 逻辑

**文件**: `src/hooks/useLineByLineReview.ts`

`currentChildAlgorithm` 的 useMemo 中，当 `childSessionData` 为空（尚未加载）时，不应 fallback 到父级 algorithm，而应返回 `undefined` 或保持一个标记。但这会导致 UI 问题（Footer 不知道显示什么按钮）。

**更好的方案**: 在 `childSessionData` 未加载完成时，不渲染评分按钮。但这需要额外的加载状态。

**最简方案**: 保持 `currentChildAlgorithm` 的 fallback 到父级 algorithm（因为这是默认值），但确保 `onLineByLineGrade` 中使用实时的 algorithm（Step 1 已修复）。

### Step 3: 修复 showAnswers useEffect 中的时序问题

**文件**: `src/components/overlay/PracticeOverlay.tsx`

showAnswers useEffect（第339-356行）依赖 `currentChildIsLblNext`，但 `currentChildIsLblNext` 依赖 `currentChildAlgorithm`，而 `currentChildAlgorithm` 依赖 `childSessionData`。当 `childSessionData` 加载完成后，`currentChildIsLblNext` 会更新，触发 showAnswers useEffect。

**问题**: 在 `childSessionData` 加载完成之前，`currentChildIsLblNext` 基于 fallback 的父级 algorithm 计算，可能导致 showAnswers 被错误设置。

**修复**: 在 showAnswers useEffect 中，当 `childSessionData` 尚未加载（为空对象）且 LBL 模式激活时，不设置 showAnswers（等待数据加载完成）。

但更简单的修复是：在 `useLineByLineReview` 的初始化 useEffect 中，当 `childSessionData` 为空时不执行初始化（因为数据还没加载）。

### Step 4: 修复初始化 useEffect 的时序问题

**文件**: `src/hooks/useLineByLineReview.ts`

初始化 useEffect（第140-156行）在 `childSessionData` 为空时也会执行，导致 `findNextDueChildIndex` 将所有子 block 视为到期，`lineByLineCurrentChildIndex` 被设为 0。

**修复**: 在 `childSessionData` 为空对象时跳过初始化，等待数据加载完成。

```typescript
React.useEffect(() => {
  if (!isLBLReviewMode || !childUidsList.length) {
    setLineByLineRevealedCount(0);
    setLineByLineCurrentChildIndex(0);
    return;
  }

  // 等待 childSessionData 加载完成
  if (Object.keys(childSessionData).length === 0) return;

  const firstDueIndex = findNextDueChildIndex(childUidsList, childSessionData, 0);
  // ...
```

但这有一个问题：如果所有子 block 都是新卡（没有任何 session 数据），`getChildSessionData` 返回的也是空对象，导致永远不初始化。

**更好的方案**: 检查 `childSessionData` 是否包含所有 `childUidsList` 中的 UID，或者检查是否已经加载过（通过一个 ref 标记）。

**实际方案**: 使用一个 `isChildDataLoaded` 标记，在 PracticeOverlay 中 `getChildSessionData` 完成后设为 true，传递给 `useLineByLineReview`。

### Step 5: 修复 `onLineByLineGrade` 中 LblNext 分支不正确设置 showAnswers

**文件**: `src/hooks/useLineByLineReview.ts`

在 LblNext 分支（第169-239行），评分完成后没有设置 `setShowAnswers`。对于下一个子 block，showAnswers 应该根据其算法类型设置。当前代码在 LblNext 分支结束后直接 return，没有设置 showAnswers。

SM2 分支在评分完成后会 `setShowAnswers(false)`（第295、314、320行），但 LblNext 分支没有。

**修复**: 在 LblNext 分支中，评分完成后根据下一个子 block 的算法设置 showAnswers。

## 修改文件清单

1. `src/hooks/useLineByLineReview.ts` — 3处修改
2. `src/components/overlay/PracticeOverlay.tsx` — 1处修改

## 具体修改

### useLineByLineReview.ts

**修改 1**: `onLineByLineGrade` 中使用实时 algorithm 替代闭包中的 `currentChildAlgorithm`

将 `currentChildAlgorithm` 和 `currentChildIsLblNext` 的获取从 useMemo 移到 `onLineByLineGrade` 内部，基于最新的 `childSessionData` 计算：

```typescript
const onLineByLineGrade = React.useCallback(async (grade: number) => {
  if (!currentCardRefUid || lineByLineCurrentChildIndex >= childUidsList.length) return;

  const childUid = childUidsList[lineByLineCurrentChildIndex];
  const existingChildSession = childSessionData[childUid] || generateNewSession({ algorithm });
  const effectiveChildAlgorithm = existingChildSession.algorithm || algorithm;
  const isLblNext = !isGradingAlgorithm(effectiveChildAlgorithm);
  
  // 使用 effectiveChildAlgorithm 和 isLblNext 替代 currentChildAlgorithm 和 currentChildIsLblNext
  if (isLblNext) {
    // ... 使用 effectiveChildAlgorithm
  } else {
    // ... 使用 effectiveChildAlgorithm
  }
```

**修改 2**: 初始化 useEffect 中等待 childSessionData 加载

添加条件：当 `isLBLReviewMode` 为 true 但 `childSessionData` 为空对象时，跳过初始化。

**修改 3**: LblNext 分支评分完成后设置 showAnswers

在 LblNext 分支的 return 之前，根据下一个子 block 的算法设置 showAnswers。

### PracticeOverlay.tsx

**修改 4**: showAnswers useEffect 中处理 childSessionData 未加载的情况

当 `childSessionData` 为空且 LBL 模式激活时，不设置 showAnswers（或默认设为 true 以避免显示 Show Answer 按钮）。
