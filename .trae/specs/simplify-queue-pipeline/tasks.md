# Tasks — 简化队列数据流

## Phase 1: 新类型定义 + 单遍分类函数

### 1.1 在 `models/practice.ts` 中定义 `TagCardSets` 类型
- [x] **File**: `src/models/practice.ts`
- **Action**: 新增 `TagCardSet` 和 `TagCardSets` 类型，保留 `Today` 类型暂不删除（渐进迁移）
- **Content**:
  ```typescript
  export type TagCardSet = {
    dueUids: RecordUid[];
    newUids: RecordUid[];
    completedUids: RecordUid[];
    renderMode: RenderMode;
    lblDeckMeta: Record<string, string[]>;
  };
  export type TagCardSets = Record<string, TagCardSet>;
  ```
- **Comments**: 每个类型一行用途注释

### 1.2 在 `queries/today.ts` 中实现 `classifyAllCards`
- [x] **File**: `src/queries/today.ts`
- **Action**: 新增 `classifyAllCards` 函数，单遍遍历所有卡片，对每张卡片调用一次 `classifyCard`，产出 `TagCardSets`
- **Logic**:
  - 遍历每个 tag 的 sessionData
  - 对每个 cardUid 调用 `classifyCard` 得到 `CardClass`
  - 按 class 分入 dueUids/newUids/completedUids
  - LBL 卡片需要 `lblDeckMeta` 和 `buildChildSessionMap`
  - dueUids 需要按 `sortNormalDueCardUids` 排序
  - newUids 需要 shuffle/reverse 处理
  - renderMode 从 deckConfigs 或 cachedData 获取
- **Comments**: 说明单遍分类替代三遍分类的设计意图

### 1.3 测试 `classifyAllCards`
- [ ] **File**: `src/queries/today.test.ts`
- **Action**: 新增测试覆盖：Normal due/new/completed、LBL due/new/completed、混合 tag、shuffle
- **Status**: 目前仅有 `it.todo()` 占位，集成测试通过但单元测试待补充

---

## Phase 2: Pipeline 重写

### 2.1 重写 `getPracticeData` 使用 `classifyAllCards`
- [x] **File**: `src/queries/data.ts`
- **Action**: 替换 pipeline 调用链（initializeToday → calculateCompletedTodayCounts → addNewCards → addDueCards → allocateDailyCards → calculateCombinedCounts → calculateTodayStatus）为：
  1. `classifyAllCards` → `TagCardSets`
  2. `allocateDailyCards` → 裁剪 `TagCardSets`
- **Return type**: `{ practiceData: Records, tagCardSets: TagCardSets }`
- **Comments**: 说明 2 步替代 7 步

### 2.2 重写 `allocateDailyCards` 操作 `TagCardSets`
- [x] **File**: `src/queries/dataProcessing.ts`
- **Action**: 修改 `allocateDailyCards` 签名，输入输出改为 `TagCardSets`，不再操作 `Today` 的冗余计数字段
- **Logic**: 裁剪各 tag 的 dueUids/newUids 数组，计数自动从 `.length` 推导。实现冻结分配（frozen distribution）：基于 dailyLimit 计算每 deck 的 cap，减去该 deck 的 completedUids，未用配额重分配给其他 deck
- **Comments**: 说明计数不再存储，冻结分配设计意图

### 2.3 测试 `allocateDailyCards` 新签名
- [x] **File**: `src/queries/dataProcessing.test.ts`
- **Action**: 更新测试适配 `TagCardSets` 输入输出

---

## Phase 3: 消费方迁移

### 3.1 更新 `usePracticeData` 使用 `TagCardSets`
- [x] **File**: `src/hooks/usePracticeData.tsx`

### 3.2 更新 `PracticeSessionContext` 使用 `TagCardSets`
- [x] **File**: `src/contexts/PracticeSessionContext.tsx`

### 3.3 更新 `useReviewRuntime` 使用 `TagCardSets`
- [x] **File**: `src/review-runtime/useReviewRuntime.ts`

### 3.4 删除 `deriveDeckSnapshot` 和 `DeckSnapshot` 类型
- [x] **File**: `src/review-runtime/selectors.ts`, `src/review-runtime/types.ts`

### 3.5 更新 `PracticeOverlay` 使用 `TagCardSets`
- [x] **File**: `src/components/overlay/PracticeOverlay.tsx`

### 3.6 更新 `Header.tsx` 使用 `TagCardSets`
- [x] **File**: `src/components/overlay/Header.tsx`

### 3.7 更新 `SidePanelWidget` 使用 `TagCardSets`
- [x] **File**: `src/components/SidePanelWidget.tsx`

---

## Phase 4: 清理旧代码

### 4.1 删除 `Today` 类型和旧 pipeline 函数
- [x] **File**: `src/models/practice.ts` — 删除 `Today`、`TodayInitial`
- [x] **File**: `src/queries/today.ts` — 删除 `initializeToday`、`calculateCompletedTodayCounts`、`addNewCards`、`addDueCards`、`calculateCombinedCounts`、`calculateTodayStatus`、`getDueCardUids`
- [x] **File**: `src/queries/data.ts` — 删除对旧 pipeline 函数的 import
- **Note**: `CompletionStatus` 保留（SidePanelWidget 仍在使用）

### 4.2 删除旧测试
- [x] **File**: `src/review-runtime/selectors.test.ts` — 删除 `deriveDeckSnapshot` 相关测试
- [x] **File**: `src/models/practice.test.ts` — 更新为 `TagCardSets` 测试

### 4.3 更新 README.md 架构说明
- [x] Pipeline 描述更新为 2 步
- [x] 删除 `deriveDeckSnapshot`/`DeckSnapshot` 引用
- [x] 更新 Key Modules 表格

---

# Task Dependencies
- [1.2] depends on [1.1]
- [1.3] depends on [1.2]
- [2.1] depends on [1.2] and [2.2]
- [2.2] depends on [1.1]
- [2.3] depends on [2.2]
- [3.1] depends on [2.1]
- [3.2] depends on [3.1]
- [3.3] depends on [3.2]
- [3.4] depends on [3.3]
- [3.5] depends on [3.3]
- [3.6] depends on [3.2]
- [3.7] depends on [3.2]
- [4.1] depends on [3.3, 3.5, 3.6, 3.7]
- [4.2] depends on [4.1]
- [4.3] depends on [4.1]
