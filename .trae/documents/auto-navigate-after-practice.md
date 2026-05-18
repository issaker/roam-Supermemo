# 计划：将自动导航定位赋予卡片练习完成后的下一页判定

## 目标

将卡片练习完成后的 `currentIndex + 1`（等同于向右翻页）替换为自动导航定位逻辑：定位到当前牌组队列中下一个未练习的卡片。若队列中已无未练习卡片，则跳转至结束画面。

## 核心思路

复用已有的游标重定位机制（`repositionRequestedRef` + `repositionVersion` + effect），增加 `'next'` 模式，从当前位置向后查找下一个未练习卡片，而非从队列头部查找。

## 修改文件

### 1. `src/review-runtime/useReviewRuntime.ts`

**a) 扩展 repositionRequestedRef 类型**

```typescript
// 原：React.useRef(true)
const repositionRequestedRef = React.useRef<'reset' | 'next' | false>('reset');
```

同步修改 `selectedTag` 变更和日期变更处的赋值：

```typescript
repositionRequestedRef.current = 'reset'; // 原：true
```

**b) 新增** **`navigateToNextUnpracticed`** **函数**

```typescript
const navigateToNextUnpracticed = React.useCallback(() => {
  repositionRequestedRef.current = 'next';
  setRepositionVersion((v) => v + 1);
}, []);
```

**c) 修改 reposition effect 支持双模式**

```typescript
React.useEffect(() => {
  if (!repositionRequestedRef.current) return;
  if (effectiveQueue.uids.length === 0) return;

  const mode = repositionRequestedRef.current;
  repositionRequestedRef.current = false;

  let targetIndex: number;
  if (mode === 'next') {
    // 从当前位置向后查找下一个未练习卡片
    const startIndex = viewStateRef.current.currentIndex + 1;
    const nextIndex = effectiveQueue.uids.findIndex(
      (uid, index) => index >= startIndex && !effectiveQueue.completedUids.has(uid)
    );
    targetIndex = nextIndex >= 0 ? nextIndex : effectiveQueue.uids.length;
  } else {
    // reset 模式：从 preCompletedCount 开始查找第一个未练习卡片（原逻辑）
    const firstUnpracticedIndex = effectiveQueue.uids.findIndex(
      (uid, index) =>
        index >= effectiveQueue.preCompletedCount && !effectiveQueue.completedUids.has(uid)
    );
    targetIndex = firstUnpracticedIndex >= 0 ? firstUnpracticedIndex : effectiveQueue.uids.length;
  }

  setViewState({
    currentIndex: targetIndex,
    focusedChildUid: undefined,
    maxVisitedChildIndex: 0,
  });
}, [repositionVersion, effectiveQueue]);
```

**d) 替换** **`reviewUnit`** **中所有** **`currentIndex + 1`** **为** **`navigateToNextUnpracticed()`**

共 4 处：

| 行号    | 场景                   | 原代码                                                                        | 新代码                           |
| ----- | -------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| \~368 | 普通卡片 Forgot 重新插入     | `setViewState(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }))` | `navigateToNextUnpracticed()` |
| \~372 | 普通卡片完成               | `setViewState(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }))` | `navigateToNextUnpracticed()` |
| \~396 | LBL 子卡 lbl-next 重新插入 | `setViewState(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }))` | `navigateToNextUnpracticed()` |
| \~399 | LBL 子卡全部完成           | `setViewState(prev => ({ ...prev, currentIndex: prev.currentIndex + 1 }))` | `navigateToNextUnpracticed()` |

**e) 在 return 中暴露** **`navigateToNextUnpracticed`**

### 2. `src/components/overlay/PracticeOverlay.tsx`

**a) 解构新增的** **`navigateToNextUnpracticed`**

**b) 替换 LBL 完成后的翻页逻辑**

```typescript
// 原：
if (isLineByLineActive && lineByLineIsCardComplete) {
  focusPrimaryByOffset(1);
  return;
}

// 新：
if (isLineByLineActive && lineByLineIsCardComplete) {
  navigateToNextUnpracticed();
  return;
}
```

**c) 更新** **`onPracticeClick`** **的依赖数组**：移除 `focusPrimaryByOffset`，添加 `navigateToNextUnpracticed`

## 设计要点

1. **Effect 机制保证一致性**：`navigateToNextUnpracticed` 与 `resetToFirstUnpracticed` 共享同一个 effect，确保 `effectiveQueue` 在 effect 执行时已包含最新的 complete/reinsert 补丁，避免索引偏移问题。
2. **向前查找**：`'next'` 模式从 `currentIndex + 1` 开始查找，只向前定位，不会回退到之前的卡片。
3. **无卡片则结束**：若 `findIndex` 返回 -1（无未练习卡片），`targetIndex = uids.length`，`currentCardRefUid` 变为 `undefined`，自动进入结束画面。
4. **LBL 子卡未完成不受影响**：`reviewUnit` 中 LBL 子卡未完成时不调用 `navigateToNextUnpracticed`，仅更新 `focusedChildUid`，逻辑不变。

