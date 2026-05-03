# 简化队列数据流 Spec

## Why

当前从 Roam 原始数据到可用的练习队列，数据要经过 7 步 pipeline（initializeToday → calculateCompletedTodayCounts → addNewCards → addDueCards → allocateDailyCards → calculateCombinedCounts → calculateTodayStatus），产出臃肿的 `Today` 类型（含冗余计数、可推导状态、可推导 combinedToday），然后 `useReviewRuntime` 再从 `Today` 中提取 `CardSet`，再经过 `deriveDeckSnapshot` 二次推导用于显示——整条路径传递多、判断多、中间格式多。

以终为始：队列只有四个核心功能——自动排序、自动定位未练习卡片、自动生成今日队列、插队。稳定快照+变化补丁的架构已经落地，现在需要简化的是**从原始数据到 CardSet 的路径**。

## What Changes

- **单遍分类替代三遍分类**：`classifyAllCards` 一次遍历所有卡片，直接产出 `Record<string, CardSet>`，替代 `calculateCompletedTodayCounts` + `addNewCards` + `addDueCards` 三次遍历
- **`Today` 类型精简为 `TagCardSets`**：去掉冗余计数（`.due`/`.new`/`.completed` = 数组 `.length`）、去掉可推导的 `status`（从计数推导）、去掉可推导的 `combinedToday`（从各 tag 汇总推导），只保留 `dueUids`/`newUids`/`completedUids`/`renderMode`/`lblDeckMeta`
- **删除 `deriveDeckSnapshot`**：显示状态从 `effectiveQueue` 和 `CardSet` 直接推导，不再从 `latestByUid` 二次分类
- **删除 `initializeToday`**：`TagCardSets` 不需要预初始化空结构
- **删除 `calculateCombinedCounts` 和 `calculateTodayStatus`**：combined 统计和 status 从 `TagCardSets` 按需推导
- **`allocateDailyCards` 直接操作 `CardSet`**：不再操作 `Today` 的冗余计数字段
- **`SidePanelWidget` 直接从 `TagCardSets` 推导**：不再依赖 `today.combinedToday`

### **BREAKING** Changes

- `Today` 类型被替换为 `TagCardSets`，所有导入 `Today` 的文件需要更新
- `deriveDeckSnapshot` 被删除，`deckSnapshot` 消费方改用 `effectiveQueue` + `CardSet` 推导
- Pipeline 函数签名变更（输入输出类型改变）

## Impact

- Affected specs: queue-system-refactor（已实现的部分不受影响，本次只改 pipeline 层和显示层）
- Affected code:
  - `src/models/practice.ts` — `Today` 类型替换为 `TagCardSets`
  - `src/queries/today.ts` — 7 步 pipeline 简化为 2 步
  - `src/queries/data.ts` — `getPracticeData` 返回类型变更
  - `src/queries/dataProcessing.ts` — `allocateDailyCards` 输入类型变更
  - `src/review-runtime/selectors.ts` — `deriveDeckSnapshot` 删除
  - `src/review-runtime/types.ts` — `DeckSnapshot` 类型删除或简化
  - `src/review-runtime/useReviewRuntime.ts` — 消费 `TagCardSets` 替代 `Today`
  - `src/hooks/usePracticeData.tsx` — 状态类型变更
  - `src/contexts/PracticeSessionContext.tsx` — context 类型变更
  - `src/components/overlay/PracticeOverlay.tsx` — 消费 `TagCardSets`，不再使用 `deckSnapshot`
  - `src/components/overlay/Header.tsx` — 从 `TagCardSets` 推导 per-tag 计数
  - `src/components/SidePanelWidget.tsx` — 从 `TagCardSets` 推导 combined 统计

## ADDED Requirements

### Requirement: 单遍卡片分类

系统 SHALL 提供 `classifyAllCards` 函数，一次遍历所有卡片，对每张卡片调用一次 `classifyCard`，直接产出 `Record<string, CardSet>`。

#### Scenario: 正常卡片分类
- **WHEN** 一张 NORMAL 卡片的 session 状态为 due
- **THEN** 该卡片的 uid 出现在对应 tag 的 `CardSet.due` 中

#### Scenario: LBL 卡片分类
- **WHEN** 一张 LBL 卡片的子卡片中有 due 的
- **THEN** 该 LBL 父卡片的 uid 出现在对应 tag 的 `CardSet.due` 中

#### Scenario: 已完成卡片分类
- **WHEN** 一张卡片今天已练习且 mastered
- **THEN** 该卡片的 uid 出现在对应 tag 的 `CardSet.completed` 中

### Requirement: TagCardSets 类型

系统 SHALL 使用 `TagCardSets` 类型替代 `Today` 类型：

```typescript
type TagCardSet = {
  dueUids: RecordUid[];
  newUids: RecordUid[];
  completedUids: RecordUid[];
  renderMode: RenderMode;
  lblDeckMeta: Record<string, string[]>;
};
type TagCardSets = Record<string, TagCardSet>;
```

#### Scenario: 计数推导
- **WHEN** UI 需要 due 计数
- **THEN** 从 `tagCardSets[tag].dueUids.length` 推导，不存储冗余数字

#### Scenario: 状态推导
- **WHEN** UI 需要完成状态
- **THEN** 从 dueUids/newUids/completedUids 的长度推导，不存储 status 字段

#### Scenario: Combined 统计推导
- **WHEN** SidePanelWidget 需要跨 tag 统计
- **THEN** 从各 tag 的 CardSet 汇总推导，不存储 combinedToday

### Requirement: 显示状态从队列推导

系统 SHALL 从 `effectiveQueue` 和 `CardSet` 直接推导显示状态，不再使用 `deriveDeckSnapshot`。

#### Scenario: renderMode 获取
- **WHEN** PracticeOverlay 需要 renderMode
- **THEN** 从 `tagCardSets[selectedTag].renderMode` 获取

#### Scenario: 已完成计数显示
- **WHEN** Done 状态需要显示已完成卡片数
- **THEN** 从 `effectiveQueue.completedUids.size` 获取

### Requirement: 简化 Pipeline

系统 SHALL 将 pipeline 从 7 步简化为 2 步：
1. `classifyAllCards` — 单遍分类，产出 `TagCardSets`
2. `allocateDailyCards` — 按每日限额裁剪 `TagCardSets`

#### Scenario: Pipeline 输出
- **WHEN** `getPracticeData` 执行
- **THEN** 返回 `{ practiceData: Records, tagCardSets: TagCardSets }`

#### Scenario: 排序保持
- **WHEN** `classifyAllCards` 产出 dueUids
- **THEN** dueUids 按 `sortNormalDueCardUids` 的紧迫度排序

## MODIFIED Requirements

### Requirement: allocateDailyCards 操作 CardSet

`allocateDailyCards` SHALL 直接操作 `TagCardSets`（裁剪 dueUids/newUids 数组），不再操作 `Today` 的冗余计数字段。裁剪后计数自动从 `.length` 推导。

### Requirement: useReviewRuntime 消费 TagCardSets

`useReviewRuntime` SHALL 直接从 `tagCardSets[selectedTag]` 获取 `CardSet`，不再从 `Today.tags[selectedTag]` 提取。

### Requirement: SidePanelWidget 从 TagCardSets 推导

`SidePanelWidget` SHALL 从 `tagCardSets` 按需推导 combined 统计（遍历各 tag 的 uid 数组长度），不再依赖 `today.combinedToday`。

## REMOVED Requirements

### Requirement: Today 类型
**Reason**: 冗余计数、可推导状态、可推导 combinedToday 增加了传递复杂度，用 `TagCardSets` 替代
**Migration**: 所有 `Today` 引用替换为 `TagCardSets`，计数/状态/combined 改为按需推导

### Requirement: deriveDeckSnapshot
**Reason**: 从 `latestByUid` 二次分类是第二真相源，与 pipeline 分类可能不一致；显示状态可从 `effectiveQueue` + `CardSet` 直接推导
**Migration**: `deckSnapshot.renderMode` → `tagCardSets[selectedTag].renderMode`；`deckSnapshot.statusSummary.completed` → `effectiveQueue.completedUids.size`

### Requirement: initializeToday
**Reason**: `TagCardSets` 不需要预初始化空结构，`classifyAllCards` 直接产出

### Requirement: calculateCombinedCounts
**Reason**: combined 统计可从 `TagCardSets` 按需推导，不需要存储

### Requirement: calculateTodayStatus
**Reason**: status 可从 uid 数组长度推导，不需要存储
