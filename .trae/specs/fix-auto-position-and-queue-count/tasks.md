# Tasks — 修复自动定位与队列计数

## Phase 1: 统一 effectiveQueue 计算

### 1.1 抽取 `computeEffectiveQueue` 纯函数
- [x] **File**: `src/review-runtime/store/queue-logic.ts`
- **Action**: 新增 `computeEffectiveQueue(uids, removedUids, cardSet)` 纯函数，实现三层过滤（uids - removedUids - cardSet mask），替代 reducer 中散落的两层过滤和 selector 中的三层过滤
- **Logic**: `uids.filter(uid => !removedSet.has(uid) && validUids.has(uid))`，其中 `validUids = getCardSetUidSet(cardSet)`
- **Verify**: 现有测试通过

### 1.2 重构 `selectEffectiveQueue` 使用 `computeEffectiveQueue`
- [x] **File**: `src/review-runtime/store/selectors.ts`
- **Action**: `selectEffectiveQueue` 调用 `computeEffectiveQueue(queue.uids, queue.removedUids, cardSet)` 替代内联过滤逻辑
- **Verify**: 现有测试通过

### 1.3 重构 reducer 中所有 effectiveQueue 计算使用 `computeEffectiveQueue`
- [x] **File**: `src/review-runtime/store/reducer.ts`
- **Action**: 在 `QUEUE_INIT`、`RESET_TO_FIRST`、`NAVIGATE_NEXT_UNPRACTICED`、`handleGradeCard` 中，将 `queue.uids.filter(uid => !removedSet.has(uid))` 替换为 `computeEffectiveQueue(queue.uids, queue.removedUids, cardSet)`
- **Verify**: `npm run test` 通过

---

## Phase 2: CHANGE_TAG 直接计算自动定位

### 2.1 修改 CHANGE_TAG handler 调用 findNextUnpracticedIndex
- [x] **File**: `src/review-runtime/store/reducer.ts`
- **Action**: CHANGE_TAG case 中，reconcileQueueForTag 后，用 computeEffectiveQueue 计算有效队列，再调用 findNextUnpracticedIndex 计算首张未练习索引，替代硬编码 `currentIndex: 0`
- **Verify**: 切换牌组后 currentIndex 直接指向首张未练习卡片

---

## Phase 3: Tag 选择单一真相源

### 3.1 修改 `onTagChange` 同步更新 App 层 selectedTag
- [x] **File**: `src/components/overlay/PracticeOverlay.tsx`, `src/app.tsx`
- **Action**: App 层传入 `onTagChange` callback，PracticeOverlay 的 onTagChange 同时 dispatch CHANGE_TAG 和调用 props.onTagChange 更新 App selectedTag
- **Verify**: 切换牌组后关闭重开 Overlay，仍显示切换后的牌组

---

## Phase 4: 队列计数区分待练习与已完成

### 4.1 新增 `selectRemainingCount` 选择器
- [x] **File**: `src/review-runtime/store/selectors.ts`
- **Action**: 新增 `selectRemainingCount(state)` — 遍历 effectiveQueue 用 isCardCompletedToday 过滤，返回未完成卡片数
- **Verify**: 单元测试覆盖

### 4.2 修改 Header 使用 `selectRemainingCount`
- [x] **File**: `src/components/overlay/Header.tsx`
- **Action**: Header 的 "当前/总数" 显示中，总数使用 `selectRemainingCount` 替代 `selectCardQueueLength`
- **Verify**: 有已完成卡片时显示 "当前/待练习总数"

### 4.3 简化 `selectCompletedCount`
- [x] **File**: `src/review-runtime/store/selectors.ts`
- **Action**: `selectCompletedCount` 直接返回 `tagData.completedUids.length`，不再遍历 dueUids/newUids 做 isCardCompletedToday 补偿
- **Note**: 依赖 Phase 6（评分后实时更新 tagCardSets）

---

## Phase 5: allocateDailyCards 对 completedUids 做 cap 截断

### 5.1 修改 allocateDailyCards 截断 completedUids
- [x] **File**: `src/queries/dataProcessing.ts`
- **Action**: 在计算 `rem` 之前，对 completedUids 做 cap 截断：如果 `completedUids.length > cap[tag]`，则 `completedUids = completedUids.slice(0, cap[tag])`
- **Verify**: `npm run test` 通过

### 5.2 更新 allocateDailyCards 测试
- [x] **File**: `src/queries/dataProcessing.test.ts`
- **Action**: 更新旧测试 + 新增测试用例覆盖 completedUids 超过 cap 的场景
- **Verify**: 测试通过

---

## Phase 6: 评分后实时更新 tagCardSets 分类

### 6.1 在 GRADE_CARD action 中更新 tagCardSets
- [x] **File**: `src/review-runtime/store/reducer.ts`
- **Action**: 新增 `reclassifyInTagCardSets` 辅助函数，handleGradeCard 中评分完成后对 targetUid 和 LBL parentUid 做增量重分类
- **Verify**: 评分后 Header 计数和侧栏计数立即更新

### 6.2 简化 selectSidebarCounts / selectTagCounts
- [x] **File**: `src/review-runtime/store/selectors.ts`
- **Action**: 直接从 dueUids/newUids/completedUids 计数，不再逐 uid 重新 classifyCard
- **Verify**: 侧栏计数与评分后实际状态一致

---

## Phase 7: 集成验证

### 7.1 运行全量测试
- [x] **Action**: `npm run check`（lint + typecheck + test）
- **Verify**: 全部通过（0 errors, 11 test suites passed, 141 tests passed）

### 7.2 手动验证核心场景
- [ ] 切换牌组后 currentIndex 直接指向首张未练习卡片
- [ ] 切换牌组后关闭重开 Overlay，仍显示切换后的牌组
- [ ] 有已完成卡片时 Header 显示 "当前/待练习总数"
- [ ] 评分后计数立即更新
- [ ] dailyLimit 限制下队列计数与配额一致

---

# Task Dependencies

- [1.2] depends on [1.1]
- [1.3] depends on [1.1]
- [2.1] depends on [1.3]
- [4.3] depends on [6.1]
- [6.2] depends on [6.1]
- [7.1] depends on all previous tasks
- [7.2] depends on [7.1]
